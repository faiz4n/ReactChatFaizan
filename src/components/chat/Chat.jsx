import { useEffect, useRef, useState } from "react";
import "./chat.css";
import EmojiPicker from "emoji-picker-react";
import {
  arrayUnion,
  doc,
  getDoc,
  onSnapshot,
  updateDoc,
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useChatStore } from "../../lib/chatStore";
import { useUserStore } from "../../lib/userStore";
import upload from "../../lib/upload";
import { format } from "timeago.js";

const Chat = () => {
  const [chat, setChat] = useState();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [img, setImg] = useState({
    file: null,
    url: "",
  });
  const [isTyping, setIsTyping] = useState(false);
  const typingTimeoutRef = useRef(null);

  const { currentUser, fetchUserInfo } = useUserStore();
  const { chatId, user, isCurrentUserBlocked, isReceiverBlocked, changeChat, resetChat } =
    useChatStore();

  const endRef = useRef(null);

  useEffect(() => {
    if (endRef.current) {
      // Find the center container (scrollable area)
      const centerContainer = endRef.current.closest('.center');
      if (centerContainer) {
        // Scroll the center container, not the page
        centerContainer.scrollTo({
          top: centerContainer.scrollHeight,
          behavior: "smooth"
        });
      } else {
        // Fallback to scrollIntoView with constraints
        endRef.current.scrollIntoView({ 
          behavior: "smooth",
          block: "end",
          inline: "nearest"
        });
      }
    }
  }, [chat?.messages]);

  useEffect(() => {
    if (!chatId || !user?.id) return;

    const checkTypingStatus = (chatData) => {
      if (!chatData) {
        setIsTyping(false);
        return;
      }

      if (chatData.typing && chatData.typing[user.id]) {
        const typingTimestamp = chatData.typing[user.id];
        let timestampMs;
        
        // Handle different timestamp formats
        if (typeof typingTimestamp === 'number') {
          timestampMs = typingTimestamp;
        } else if (typingTimestamp && typeof typingTimestamp.toMillis === 'function') {
          // Firestore Timestamp
          timestampMs = typingTimestamp.toMillis();
        } else if (typingTimestamp && typingTimestamp.seconds) {
          // Firestore Timestamp with seconds property
          timestampMs = typingTimestamp.seconds * 1000;
        } else {
          setIsTyping(false);
          return;
        }
        
        const now = Date.now();
        // Consider typing if timestamp is within last 4 seconds (account for network delays)
        const timeDiff = now - timestampMs;
        if (timeDiff < 4000 && timeDiff >= -1000) { // Allow 1 second negative for clock skew
          setIsTyping(true);
        } else {
          setIsTyping(false);
        }
      } else {
        setIsTyping(false);
      }
    };

    const unSub = onSnapshot(doc(db, "chats", chatId), (res) => {
      const chatData = res.data();
      setChat(chatData);
      checkTypingStatus(chatData);
    });

    // Periodic check to clear stale typing indicators (every 1 second)
    const typingCheckInterval = setInterval(() => {
      getDoc(doc(db, "chats", chatId)).then((snapshot) => {
        if (snapshot.exists()) {
          const chatData = snapshot.data();
          checkTypingStatus(chatData);
        } else {
          setIsTyping(false);
        }
      });
    }, 1000);

    return () => {
      unSub();
      clearInterval(typingCheckInterval);
    };
  }, [chatId, user?.id]);

  // Listen to receiver's user document for real-time block status updates
  // This detects when the receiver blocks/unblocks the current user
  useEffect(() => {
    if (!user?.id || !chatId) return;

    const unSub = onSnapshot(doc(db, "users", user.id), async (userSnapshot) => {
      if (!userSnapshot.exists()) return;
      
      const updatedUser = userSnapshot.data();
      
      // Get the latest currentUser from store (it should already be up to date)
      const latestCurrentUser = useUserStore.getState().currentUser;
      
      if (!latestCurrentUser) return;
      
      // Re-check block status with updated receiver data
      // This will check if receiver (user) has blocked currentUser
      changeChat(chatId, updatedUser);
    });

    return () => {
      unSub();
    };
  }, [user?.id, chatId, changeChat]);

  // Listen to currentUser's document for real-time block status updates
  // This detects when the current user blocks/unblocks the receiver
  useEffect(() => {
    if (!currentUser?.id || !user?.id || !chatId) return;

    const unSub = onSnapshot(doc(db, "users", currentUser.id), async (currentUserSnapshot) => {
      if (!currentUserSnapshot.exists()) return;
      
      // Refresh currentUser in the store to get latest blocked array
      await fetchUserInfo(currentUser.id);
      
      // Get the latest user from chatStore
      const latestUser = useChatStore.getState().user;
      
      if (!latestUser) return;
      
      // Re-check block status with updated currentUser data
      // This will check if currentUser has blocked the receiver (user)
      changeChat(chatId, latestUser);
    });

    return () => {
      unSub();
    };
  }, [currentUser.id, user?.id, chatId, fetchUserInfo, changeChat]);

  const handleEmoji = (e) => {
    const newText = text + e.emoji;
    handleTyping(newText);
    setOpen(false);
  };

  const handleImg = (e) => {
    if (e.target.files[0]) {
      setImg({
        file: e.target.files[0],
        url: URL.createObjectURL(e.target.files[0]),
      });
    }
  };

  // Update typing status in Firebase
  const updateTypingStatus = async (isUserTyping) => {
    if (!chatId || !currentUser?.id) return;

    try {
      const chatRef = doc(db, "chats", chatId);
      if (isUserTyping) {
        // Use client timestamp for more reliable comparison
        await updateDoc(chatRef, {
          [`typing.${currentUser.id}`]: Date.now(),
        });
      } else {
        // Remove typing status
        const chatSnap = await getDoc(chatRef);
        if (chatSnap.exists()) {
          const chatData = chatSnap.data();
          if (chatData.typing && chatData.typing[currentUser.id]) {
            const updatedTyping = { ...chatData.typing };
            delete updatedTyping[currentUser.id];
            
            // If typing object is empty, set it to empty object, otherwise update with remaining keys
            if (Object.keys(updatedTyping).length === 0) {
              await updateDoc(chatRef, {
                typing: {},
              });
            } else {
              await updateDoc(chatRef, {
                typing: updatedTyping,
              });
            }
          }
        }
      }
    } catch (err) {
      console.log("Error updating typing status:", err);
    }
  };

  // Handle typing with debounce
  const handleTyping = (value) => {
    setText(value);

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Update typing status
    if (value.trim() !== "" && !isCurrentUserBlocked && !isReceiverBlocked) {
      updateTypingStatus(true);
    } else {
      // Clear typing if input is empty
      updateTypingStatus(false);
    }

    // Clear typing status after 2 seconds of no typing
    typingTimeoutRef.current = setTimeout(() => {
      updateTypingStatus(false);
    }, 2000);
  };

  const handleSend = async () => {
    if (text === "") return;

    // Clear typing status
    updateTypingStatus(false);
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    let imgUrl = null;

    try {
      if (img.file) {
        imgUrl = await upload(img.file);
      }

      await updateDoc(doc(db, "chats", chatId), {
        messages: arrayUnion({
          senderId: currentUser.id,
          text,
          createdAt: new Date(),
          ...(imgUrl && { img: imgUrl }),
        }),
      });

      const userIDs = [currentUser.id, user.id];

      userIDs.forEach(async (id) => {
        const userChatsRef = doc(db, "userchats", id);
        const userChatsSnapshot = await getDoc(userChatsRef);

        if (userChatsSnapshot.exists()) {
          const userChatsData = userChatsSnapshot.data();

          const chatIndex = userChatsData.chats.findIndex(
            (c) => c.chatId === chatId
          );

          userChatsData.chats[chatIndex].lastMessage = text;
          userChatsData.chats[chatIndex].isSeen =
            id === currentUser.id ? true : false;
          userChatsData.chats[chatIndex].updatedAt = Date.now();

          await updateDoc(userChatsRef, {
            chats: userChatsData.chats,
          });
        }
      });
    } catch (err) {
      console.log(err);
    } finally {
      setImg({
        file: null,
        url: "",
      });

      setText("");
    }
  };

  // Cleanup typing status on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      updateTypingStatus(false);
    };
  }, [chatId]);

  // Close emoji picker when blocked
  useEffect(() => {
    if (isCurrentUserBlocked || isReceiverBlocked) {
      setOpen(false);
    }
  }, [isCurrentUserBlocked, isReceiverBlocked]);

  const handleBack = () => {
    resetChat();
  };

  return (
    <div className={`chat ${chatId ? 'mobile-visible' : ''}`}>
      <div className="top">
        <div className="user">
          <button className="back-button" onClick={handleBack} aria-label="Back">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
          </button>
          <img src={user?.avatar || "./avatar.png"} alt="" />
          <div className="texts">
            <span>{user?.username}</span>
            <p>{isTyping ? "typing..." : ""}</p>
          </div>
        </div>
        <div className="icons">
          <img src="./phone.png" alt="" />
          <img src="./video.png" alt="" />
          <img 
            src="./info.png" 
            alt="" 
            onClick={() => {
              // Toggle detail panel on mobile
              const detailPanel = document.querySelector('.detail');
              if (detailPanel) {
                detailPanel.classList.toggle('mobile-visible');
              }
            }}
            style={{ cursor: 'pointer' }}
          />
        </div>
      </div>
      <div className="center">
        {chat?.messages?.map((message) => (
          <div
            className={
              message.senderId === currentUser?.id ? "message own" : "message"
            }
            key={message?.createAt}
          >
            <div className="texts">
              {message.img && <img src={message.img} alt="" />}
              <p>{message.text}</p>
              <span>{format(message.createdAt.toDate())}</span>
            </div>
          </div>
        ))}
        {img.url && (
          <div className="message own">
            <div className="texts">
              <img src={img.url} alt="" />
            </div>
          </div>
        )}
        {isTyping && !isCurrentUserBlocked && !isReceiverBlocked && (
          <div className="message typing-message">
            <div className="texts">
              <div className="typing-indicator">
                <span className="dot"></span>
                <span className="dot"></span>
                <span className="dot"></span>
              </div>
            </div>
          </div>
        )}
        <div ref={endRef}></div>
      </div>
      <div className="bottom">
        <div className="icons">
          <label 
            htmlFor="file"
            style={{ 
              cursor: isCurrentUserBlocked || isReceiverBlocked ? "not-allowed" : "pointer",
              opacity: isCurrentUserBlocked || isReceiverBlocked ? 0.5 : 1
            }}
          >
            <img src="./img.png" alt="" />
          </label>
          <input
            type="file"
            id="file"
            style={{ display: "none" }}
            onChange={handleImg}
            disabled={isCurrentUserBlocked || isReceiverBlocked}
          />
          {/* <img src="./camera.png" alt="" />
          <img src="./mic.png" alt="" /> */}
        </div>

        <input
          type="text"
          placeholder={
            isCurrentUserBlocked || isReceiverBlocked
              ? "You cannot send a message"
              : "Type a message..."
          }
          value={text}
          onChange={(e) => handleTyping(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              handleSend();
            }
          }}
          disabled={isCurrentUserBlocked || isReceiverBlocked}
        />
        <div className="emoji">
          <img
            src="./emoji.png"
            alt=""
            onClick={() => {
              if (!isCurrentUserBlocked && !isReceiverBlocked) {
                setOpen((prev) => !prev);
              }
            }}
            style={{ 
              cursor: isCurrentUserBlocked || isReceiverBlocked ? "not-allowed" : "pointer",
              opacity: isCurrentUserBlocked || isReceiverBlocked ? 0.5 : 1
            }}
          />
          <div className="picker">
            <EmojiPicker open={open && !isCurrentUserBlocked && !isReceiverBlocked} onEmojiClick={handleEmoji} />
          </div>
        </div>
        <button
          className="sendButton"
          onClick={handleSend}
          disabled={isCurrentUserBlocked || isReceiverBlocked}
        >
          Send
        </button>
      </div>
    </div>
  );
};

export default Chat;
