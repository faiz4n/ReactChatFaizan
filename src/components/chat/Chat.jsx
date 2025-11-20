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

  // NEW unified file state (images + documents)
  const [fileData, setFileData] = useState({
    file: null,
    previewUrl: "",
  });

  const [isUploading, setIsUploading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [showFileMenu, setShowFileMenu] = useState(false);
  const [receiverStatus, setReceiverStatus] = useState({
    isOnline: false,
    lastSeen: null,
  });
  const [showMessageMenu, setShowMessageMenu] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const typingTimeoutRef = useRef(null);
  const fileMenuRef = useRef(null);
  const messageMenuRef = useRef(null);

  const { currentUser, fetchUserInfo } = useUserStore();
  const {
    chatId,
    user,
    isCurrentUserBlocked,
    isReceiverBlocked,
    changeChat,
    resetChat,
  } = useChatStore();

  const endRef = useRef(null);

  // Auto scroll - skip if deleting message
  useEffect(() => {
    if (isDeleting) return; // Don't scroll when deleting

    if (endRef.current) {
      const centerContainer = endRef.current.closest(".center");
      if (centerContainer) {
        centerContainer.scrollTo({
          top: centerContainer.scrollHeight,
          behavior: "smooth",
        });
      } else {
        endRef.current.scrollIntoView({
          behavior: "smooth",
          block: "end",
          inline: "nearest",
        });
      }
    }
  }, [chat?.messages, isDeleting]);

  // Typing + message listener
  useEffect(() => {
    if (!chatId || !user?.id) return;

    const checkTypingStatus = (chatData) => {
      if (!chatData) return setIsTyping(false);

      const receiverTyping = chatData.typing?.[user.id];
      if (!receiverTyping) return setIsTyping(false);

      let timestampMs;

      if (typeof receiverTyping === "number") {
        timestampMs = receiverTyping;
      } else if (
        receiverTyping &&
        typeof receiverTyping.toMillis === "function"
      ) {
        timestampMs = receiverTyping.toMillis();
      } else if (receiverTyping?.seconds) {
        timestampMs = receiverTyping.seconds * 1000;
      } else return setIsTyping(false);

      const now = Date.now();
      const diff = now - timestampMs;

      setIsTyping(diff < 4000 && diff >= -1000);
    };

    const unsub = onSnapshot(
      doc(db, "chats", chatId),
      (res) => {
        const chatData = res.data();
        console.log("📥 [Chat Listener] Received chat update:", {
          hasMessages: !!chatData?.messages,
          messageCount: chatData?.messages?.length || 0,
          lastMessage: chatData?.messages?.[chatData.messages.length - 1],
        });
        setChat(chatData);
        checkTypingStatus(chatData);
      },
      (error) => {
        console.error("❌ [Chat Listener] Error:", error);
      }
    );

    const interval = setInterval(() => {
      getDoc(doc(db, "chats", chatId)).then((snap) => {
        if (snap.exists()) checkTypingStatus(snap.data());
        else setIsTyping(false);
      });
    }, 1000);

    return () => {
      unsub();
      clearInterval(interval);
    };
  }, [chatId, user?.id]);

  // Online status and live-block update listener (receiver)
  useEffect(() => {
    if (!user?.id || !chatId) return;

    const unSub = onSnapshot(doc(db, "users", user.id), (snap) => {
      if (!snap.exists()) return;
      const updatedUser = snap.data();

      // Update online status
      setReceiverStatus({
        isOnline: updatedUser.isOnline || false,
        lastSeen: updatedUser.lastSeen || null,
      });

      const latestCurrent = useUserStore.getState().currentUser;
      if (!latestCurrent) return;

      changeChat(chatId, updatedUser);
    });

    return () => unSub();
  }, [user?.id, chatId, changeChat]);

  // Set current user online status with heartbeat
  useEffect(() => {
    if (!currentUser?.id) return;

    const userRef = doc(db, "users", currentUser.id);

    // Set online when component mounts
    updateDoc(userRef, {
      isOnline: true,
      lastSeen: new Date(),
    });

    // Update lastSeen every 30 seconds (heartbeat)
    const heartbeatInterval = setInterval(() => {
      updateDoc(userRef, {
        isOnline: true,
        lastSeen: new Date(),
      });
    }, 30000);

    // Set offline when component unmounts or user changes
    return () => {
      clearInterval(heartbeatInterval);
      updateDoc(userRef, {
        isOnline: false,
        lastSeen: new Date(),
      });
    };
  }, [currentUser?.id]);

  // Mark messages as seen when chat is opened
  useEffect(() => {
    if (!chatId || !currentUser?.id || !chat?.messages) return;

    const markAsSeen = async () => {
      const chatRef = doc(db, "chats", chatId);
      const chatSnap = await getDoc(chatRef);

      if (!chatSnap.exists()) return;

      const messages = chatSnap.data().messages || [];
      let hasUnseen = false;

      const updatedMessages = messages.map((msg) => {
        if (
          msg.senderId !== currentUser.id &&
          !msg.seenBy?.includes(currentUser.id)
        ) {
          hasUnseen = true;
          return {
            ...msg,
            seenBy: [...(msg.seenBy || []), currentUser.id],
          };
        }
        return msg;
      });

      if (hasUnseen) {
        await updateDoc(chatRef, { messages: updatedMessages });
      }
    };

    markAsSeen();
  }, [chatId, currentUser?.id, chat?.messages]);

  // Live-block update listener (current user)
  useEffect(() => {
    if (!currentUser?.id || !user?.id || !chatId) return;

    const unSub = onSnapshot(doc(db, "users", currentUser.id), async (snap) => {
      if (!snap.exists()) return;

      await fetchUserInfo(currentUser.id);
      const latestReceiver = useChatStore.getState().user;
      if (!latestReceiver) return;

      changeChat(chatId, latestReceiver);
    });

    return () => unSub();
  }, [currentUser.id, user?.id, chatId, fetchUserInfo, changeChat]);

  // Typing handlers
  const updateTypingStatus = async (typing) => {
    if (!chatId || !currentUser?.id) return;

    try {
      const chatRef = doc(db, "chats", chatId);
      if (typing) {
        await updateDoc(chatRef, { [`typing.${currentUser.id}`]: Date.now() });
      } else {
        const snap = await getDoc(chatRef);
        if (!snap.exists()) return;

        const data = snap.data();
        const updatedTyping = { ...(data.typing || {}) };
        delete updatedTyping[currentUser.id];

        await updateDoc(chatRef, { typing: updatedTyping });
      }
    } catch (err) {
      console.log("Typing update error:", err);
    }
  };

  const handleTyping = (value) => {
    setText(value);

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    if (value.trim() !== "" && !isCurrentUserBlocked && !isReceiverBlocked) {
      updateTypingStatus(true);
    } else updateTypingStatus(false);

    typingTimeoutRef.current = setTimeout(() => {
      updateTypingStatus(false);
    }, 2000);
  };

  // FILE INPUT HANDLER
  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setFileData({
      file,
      previewUrl:
        file.type && file.type.startsWith("image/")
          ? URL.createObjectURL(file)
          : "",
    });
    setShowFileMenu(false);
    // Reset input so same file can be selected again
    e.target.value = "";
  };

  // Handle image selection
  const handleImageSelect = () => {
    const input = document.getElementById("file-image");
    if (input) input.click();
  };

  // Handle document selection
  const handleDocumentSelect = () => {
    const input = document.getElementById("file-document");
    if (input) input.click();
  };

  // Close file menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        fileMenuRef.current &&
        !fileMenuRef.current.contains(event.target) &&
        !event.target.closest(".file-menu-trigger")
      ) {
        setShowFileMenu(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // SEND MESSAGE (TEXT + ANY FILE)
  const handleSend = async () => {
    // Validation
    if (!text && !fileData.file) {
      console.log("❌ Cannot send: No text and no file");
      return;
    }

    if (!chatId) {
      console.error("❌ Cannot send: No chatId");
      alert("Error: No chat selected");
      return;
    }

    if (!currentUser?.id) {
      console.error("❌ Cannot send: No currentUser");
      alert("Error: User not logged in");
      return;
    }

    if (!user?.id) {
      console.error("❌ Cannot send: No receiver user");
      alert("Error: No receiver selected");
      return;
    }

    console.log("📤 Starting send process...", {
      hasText: !!text,
      hasFile: !!fileData.file,
      fileName: fileData.file?.name,
      fileType: fileData.file?.type,
      fileSize: fileData.file?.size,
      chatId,
      currentUserId: currentUser.id,
      receiverId: user.id,
    });

    updateTypingStatus(false);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    // Store file reference BEFORE clearing state
    const fileToUpload = fileData.file;
    const previewUrlToRevoke = fileData.previewUrl;
    const textToSend = text;

    // Set uploading state and clear preview immediately
    setIsUploading(true);
    setFileData({ file: null, previewUrl: "" });
    if (previewUrlToRevoke) {
      URL.revokeObjectURL(previewUrlToRevoke);
    }

    let uploadedFile = null;

    try {
      // Upload file if present
      if (fileToUpload) {
        console.log("📁 Uploading file:", fileToUpload.name, fileToUpload.type);
        uploadedFile = await upload(fileToUpload); // returns {url,name,type,size}
        console.log("✅ File uploaded successfully:", uploadedFile);
      }

      // Prepare message object
      // Note: Use Date() instead of serverTimestamp() because serverTimestamp()
      // cannot be used inside arrayUnion(). Firestore will convert Date to Timestamp automatically.
      const messageObj = {
        senderId: currentUser.id,
        text: textToSend || "",
        createdAt: new Date(),
        seenBy: [],
        ...(uploadedFile && { file: uploadedFile }),
      };

      console.log(
        "💬 Sending message to Firestore:",
        JSON.stringify(messageObj, null, 2)
      );
      console.log("💬 Chat document path: chats/" + chatId);

      // Verify chat document exists first
      const chatDocRef = doc(db, "chats", chatId);
      const chatDocSnap = await getDoc(chatDocRef);

      if (!chatDocSnap.exists()) {
        throw new Error(`Chat document does not exist: ${chatId}`);
      }

      console.log("✅ Chat document exists, adding message...");

      // Add message to chat
      await updateDoc(chatDocRef, {
        messages: arrayUnion(messageObj),
      });

      console.log("✅ Message added to chat successfully");

      // Verify message was added
      const verifySnap = await getDoc(chatDocRef);
      const verifyMessages = verifySnap.data()?.messages || [];
      console.log(
        `✅ Verification: Chat now has ${verifyMessages.length} messages`
      );
      console.log(
        "✅ Last message:",
        verifyMessages[verifyMessages.length - 1]
      );

      // Update lastMessage for both users
      const ids = [currentUser.id, user.id];
      console.log("🔄 Updating lastMessage for users:", ids);

      await Promise.all(
        ids.map(async (id) => {
          try {
            const ref = doc(db, "userchats", id);
            const snap = await getDoc(ref);

            if (snap.exists()) {
              const data = snap.data();
              const i = data.chats.findIndex((c) => c.chatId === chatId);

              if (i !== -1) {
                data.chats[i].lastMessage =
                  textToSend || uploadedFile?.name || "File";
                data.chats[i].isSeen = id === currentUser.id;
                data.chats[i].updatedAt = Date.now();

                await updateDoc(ref, { chats: data.chats });
                console.log(`✅ Updated lastMessage for user: ${id}`);
              } else {
                console.warn(`⚠️ Chat not found in userchats for user: ${id}`);
              }
            } else {
              console.warn(`⚠️ userchats document not found for user: ${id}`);
            }
          } catch (userChatErr) {
            console.error(
              `❌ Error updating userchats for ${id}:`,
              userChatErr
            );
          }
        })
      );

      console.log("🎉 Message sent successfully!");
    } catch (err) {
      console.error("❌ Error sending message:", err);
      console.error("Error details:", {
        message: err.message,
        code: err.code,
        stack: err.stack,
        name: err.name,
      });

      // Restore file data on error so user can retry
      if (fileToUpload) {
        const newPreviewUrl = fileToUpload.type?.startsWith("image/")
          ? URL.createObjectURL(fileToUpload)
          : "";
        setFileData({
          file: fileToUpload,
          previewUrl: newPreviewUrl,
        });
      }

      alert(
        `Failed to send message: ${
          err.message || "Unknown error"
        }\n\nCheck console for details.`
      );
    } finally {
      // Clear file data and text
      setFileData({ file: null, previewUrl: "" });
      setText("");
      setIsUploading(false);
      console.log("🧹 Cleaned up file preview and text input");
    }
  };

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      updateTypingStatus(false);
    };
  }, [chatId]);

  useEffect(() => {
    if (isCurrentUserBlocked || isReceiverBlocked) setOpen(false);
  }, [isCurrentUserBlocked, isReceiverBlocked]);

  const handleBack = () => resetChat();

  // Helper function to format last seen
  const formatLastSeen = (lastSeen) => {
    if (!lastSeen) return "";
    let lastSeenDate;
    if (lastSeen?.toDate) {
      lastSeenDate = lastSeen.toDate();
    } else if (lastSeen instanceof Date) {
      lastSeenDate = lastSeen;
    } else if (lastSeen?.seconds) {
      lastSeenDate = new Date(lastSeen.seconds * 1000);
    } else {
      lastSeenDate = new Date(lastSeen);
    }
    return format(lastSeenDate);
  };

  // Helper to update lastMessage in userchats after deletion
  const updateLastMessageAfterDelete = async (updatedMessages) => {
    const ids = [currentUser.id, user.id];
    
    await Promise.all(
      ids.map(async (id) => {
        try {
          const ref = doc(db, "userchats", id);
          const snap = await getDoc(ref);

          if (snap.exists()) {
            const data = snap.data();
            const i = data.chats.findIndex((c) => c.chatId === chatId);

            if (i !== -1) {
              // Find the last message that is not deleted for this user
              const visibleMessages = updatedMessages.filter(
                (msg) => !msg.deletedFor?.includes(id)
              );

              if (visibleMessages.length > 0) {
                const lastMsg = visibleMessages[visibleMessages.length - 1];
                data.chats[i].lastMessage = lastMsg.text || lastMsg.file?.name || "File";
                data.chats[i].updatedAt = Date.now();
              } else {
                // No messages left
                data.chats[i].lastMessage = "No messages yet";
                data.chats[i].updatedAt = Date.now();
              }

              await updateDoc(ref, { chats: data.chats });
              console.log(`✅ Updated lastMessage after delete for user: ${id}`);
            }
          }
        } catch (err) {
          console.error(`❌ Error updating userchats for ${id}:`, err);
        }
      })
    );
  };

  // Delete message handler
  const handleDeleteMessage = async (
    messageIndex,
    deleteForEveryone = false
  ) => {
    if (!chatId || !currentUser?.id) return;

    setIsDeleting(true); // Prevent auto-scroll
    try {
      const chatRef = doc(db, "chats", chatId);
      const chatSnap = await getDoc(chatRef);

      if (!chatSnap.exists()) return;

      const messages = chatSnap.data().messages || [];
      const message = messages[messageIndex];

      // Check if user can delete (must be sender for delete for everyone)
      if (deleteForEveryone && message.senderId !== currentUser.id) {
        alert("You can only delete your own messages for everyone");
        return;
      }

      let updatedMessages;

      if (deleteForEveryone && message.senderId === currentUser.id) {
        // Delete for everyone - remove from messages array
        updatedMessages = messages.filter((_, idx) => idx !== messageIndex);
        await updateDoc(chatRef, { messages: updatedMessages });
      } else {
        // Delete for me - add to deletedFor array
        updatedMessages = messages.map((msg, idx) => {
          if (idx === messageIndex) {
            return {
              ...msg,
              deletedFor: [...(msg.deletedFor || []), currentUser.id],
            };
          }
          return msg;
        });
        await updateDoc(chatRef, { messages: updatedMessages });
      }

      // Update lastMessage in userchats for both users
      await updateLastMessageAfterDelete(updatedMessages);

      setShowMessageMenu(null);
    } catch (err) {
      console.error("Error deleting message:", err);
      alert("Failed to delete message");
    } finally {
      // Re-enable auto-scroll after a short delay
      setTimeout(() => {
        setIsDeleting(false);
      }, 500);
    }
  };

  // Close message menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        messageMenuRef.current &&
        !messageMenuRef.current.contains(event.target) &&
        !event.target.closest(".message")
      ) {
        setShowMessageMenu(null);
      }
    };

    if (showMessageMenu !== null) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showMessageMenu]);

  return (
    <div className={`chat ${chatId ? "mobile-visible" : ""}`}>
      <div className="top">
        <div className="user">
          <button className="back-button" onClick={handleBack}>
            <svg width="24" height="24" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>

          <img src={user?.avatar || "./avatar.png"} alt="" />

          <div className="texts">
            <span>{user?.username}</span>
            <p>
              {isTyping
                ? "typing..."
                : receiverStatus.isOnline
                ? "online"
                : receiverStatus.lastSeen
                ? `last seen ${formatLastSeen(receiverStatus.lastSeen)}`
                : ""}
            </p>
          </div>
        </div>

        <div className="icons">
          <img
            src="./info.png"
            alt=""
            className="info-icon"
            onClick={() =>
              document
                .querySelector(".detail")
                ?.classList.toggle("mobile-visible")
            }
          />
        </div>
      </div>

      <div className="center">
        {chat?.messages
          ?.filter((msg) => !msg.deletedFor?.includes(currentUser?.id))
          ?.map((message, index) => {
            const isOwnMessage = message.senderId === currentUser?.id;
            const isSeen = isOwnMessage && message.seenBy?.includes(user?.id);
            const isDelivered = isOwnMessage && message.seenBy?.length > 0;

            return (
              <div
                className={`message ${isOwnMessage ? "own" : ""}`}
                key={index}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setShowMessageMenu(index);
                }}
              >
                <div className="texts">
                  {/* IMAGE FILE */}
                  {message.file &&
                    (message.file.type?.startsWith("image/") ||
                      (!message.file.type &&
                        /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(
                          message.file.name
                        ))) && <img src={message.file.url} alt="" />}

                  {/* ANY OTHER FILE */}
                  {message.file &&
                    !message.file.type?.startsWith("image/") &&
                    !(
                      !message.file.type &&
                      /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(
                        message.file.name
                      )
                    ) && (
                      <a
                        href={message.file.url}
                        download={message.file.name}
                        target="_blank"
                        rel="noreferrer"
                        className="file-download"
                      >
                        <span className="file-icon">📎</span>
                        <span className="file-name">{message.file.name}</span>
                      </a>
                    )}

                  {/* TEXT */}
                  {message.text && <p>{message.text}</p>}

                  <div className="message-footer">
                    <span>
                      {message.createdAt?.toDate
                        ? format(message.createdAt.toDate())
                        : message.createdAt instanceof Date
                        ? format(message.createdAt)
                        : message.createdAt?.seconds
                        ? format(new Date(message.createdAt.seconds * 1000))
                        : ""}
                    </span>
                    {isOwnMessage && (
                      <span className="message-status">
                        {isSeen ? (
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M20 6L9 17l-5-5" />
                            <path d="M20 12L9 23l-5-5" />
                          </svg>
                        ) : isDelivered ? (
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M20 6L9 17l-5-5" />
                            <path d="M20 12L9 23l-5-5" />
                          </svg>
                        ) : (
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M20 6L9 17l-5-5" />
                          </svg>
                        )}
                      </span>
                    )}
                  </div>
                </div>

                {/* Message Context Menu - styled like file menu */}
                {showMessageMenu === index && (
                  <div
                    className="message-menu"
                    ref={messageMenuRef}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {isOwnMessage && (
                      <div
                        className="message-menu-item delete-everyone"
                        onClick={() => handleDeleteMessage(index, true)}
                      >
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                        <span>Delete for everyone</span>
                      </div>
                    )}
                    <div
                      className="message-menu-item delete-me"
                      onClick={() => handleDeleteMessage(index, false)}
                    >
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                      <span>Delete for me</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

        {/* PREVIEW BEFORE SENDING - IMAGE */}
        {fileData.previewUrl && !isUploading && (
          <div className="message own">
            <div className="texts">
              <img src={fileData.previewUrl} alt="" />
            </div>
          </div>
        )}

        {/* PREVIEW BEFORE SENDING - NON-IMAGE */}
        {fileData.file && !fileData.previewUrl && !isUploading && (
          <div className="message own">
            <div className="texts">
              <div className="file-preview">
                <span className="file-icon">📎</span>
                <span className="file-name">{fileData.file.name}</span>
              </div>
            </div>
          </div>
        )}

        {/* UPLOADING INDICATOR */}
        {isUploading && (
          <div className="message own">
            <div className="texts">
              <div className="uploading-indicator">
                <span>⏳ Uploading file...</span>
              </div>
            </div>
          </div>
        )}

        {/* LIVE TYPING INDICATOR */}
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
          {/* + Icon with File Menu */}
          <div className="file-menu-container">
            <button
              className="file-menu-trigger"
              onClick={() =>
                !isCurrentUserBlocked &&
                !isReceiverBlocked &&
                setShowFileMenu(!showFileMenu)
              }
              disabled={isCurrentUserBlocked || isReceiverBlocked}
              type="button"
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
            </button>

            {/* File Menu Dropdown */}
            {showFileMenu && (
              <div className="file-menu" ref={fileMenuRef}>
                <div
                  className="file-menu-item"
                  onClick={handleImageSelect}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleImageSelect();
                    }
                  }}
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <rect
                      x="3"
                      y="3"
                      width="18"
                      height="18"
                      rx="2"
                      ry="2"
                    ></rect>
                    <circle cx="8.5" cy="8.5" r="1.5"></circle>
                    <polyline points="21 15 16 10 5 21"></polyline>
                  </svg>
                  <span>Image</span>
                </div>
                <div
                  className="file-menu-item"
                  onClick={handleDocumentSelect}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleDocumentSelect();
                    }
                  }}
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <line x1="16" y1="13" x2="8" y2="13"></line>
                    <line x1="16" y1="17" x2="8" y2="17"></line>
                    <polyline points="10 9 9 9 8 9"></polyline>
                  </svg>
                  <span>Document</span>
                </div>
              </div>
            )}

            {/* Hidden file inputs */}
            <input
              type="file"
              id="file-image"
              style={{ display: "none" }}
              onChange={handleFile}
              disabled={isCurrentUserBlocked || isReceiverBlocked}
              accept="image/*"
            />
            <input
              type="file"
              id="file-document"
              style={{ display: "none" }}
              onChange={handleFile}
              disabled={isCurrentUserBlocked || isReceiverBlocked}
              accept="*"
            />
          </div>
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
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
        />

        <div className="emoji">
          <img
            src="./emoji.png"
            alt=""
            onClick={() =>
              !isCurrentUserBlocked && !isReceiverBlocked && setOpen(!open)
            }
          />
          <div className="picker">
            <EmojiPicker
              open={open}
              onEmojiClick={(e) => handleTyping(text + e.emoji)}
            />
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
