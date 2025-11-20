import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  arrayUnion,
  doc,
  getDoc,
  onSnapshot,
  updateDoc,
} from "firebase/firestore";
import { deleteObject, ref as storageRef } from "firebase/storage";
import { db, storage } from "../../lib/firebase";
import { useChatStore } from "../../lib/chatStore";
import { useUserStore } from "../../lib/userStore";
import upload from "../../lib/upload";

const useChatController = () => {
  const [chat, setChat] = useState();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [fileData, setFileData] = useState({
    file: null,
    previewUrl: "",
  });
  const [isTyping, setIsTyping] = useState(false);
  const [showFileMenu, setShowFileMenu] = useState(false);
  const [receiverStatus, setReceiverStatus] = useState({
    isOnline: false,
    lastSeen: null,
  });
  const [showMessageMenu, setShowMessageMenu] = useState(null);
  const [messageMenuConfig, setMessageMenuConfig] = useState({
    placement: "above",
    align: "right",
  });
  const [isDeleting, setIsDeleting] = useState(false);
  const [suppressScrollOnce, setSuppressScrollOnce] = useState(false);
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

  const visibleMessages = useMemo(() => {
    if (!chat?.messages || !currentUser?.id) return [];

    return chat.messages.reduce((acc, message, originalIndex) => {
      if (message.deletedFor?.includes(currentUser.id)) return acc;
      acc.push({ message, originalIndex });
      return acc;
    }, []);
  }, [chat?.messages, currentUser?.id]);

  useEffect(() => {
    if (!chatId || !user?.id) return;

    const checkTypingStatus = (chatData) => {
      if (!chatData) {
        setIsTyping(false);
        return;
      }

      const receiverTyping = chatData.typing?.[user.id];
      if (!receiverTyping) {
        setIsTyping(false);
        return;
      }

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
      } else {
        setIsTyping(false);
        return;
      }

      const diff = Date.now() - timestampMs;
      setIsTyping(diff < 4000 && diff >= -1000);
    };

    const unsub = onSnapshot(
      doc(db, "chats", chatId),
      (res) => {
        const chatData = res.data();
        setChat(chatData);
        checkTypingStatus(chatData);
      },
      (error) => {
        console.error("Chat listener error:", error);
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

  useEffect(() => {
    if (!user?.id || !chatId) return;

    const unSub = onSnapshot(doc(db, "users", user.id), (snap) => {
      if (!snap.exists()) return;
      const updatedUser = snap.data();

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

  useEffect(() => {
    if (!currentUser?.id) return;

    const userRef = doc(db, "users", currentUser.id);

    const markOnline = () =>
      updateDoc(userRef, {
        isOnline: true,
        lastSeen: new Date(),
      }).catch((err) =>
        console.error("Failed to mark user online:", err.message || err)
      );

    const markOffline = () =>
      updateDoc(userRef, {
        isOnline: false,
        lastSeen: new Date(),
      }).catch((err) =>
        console.error("Failed to mark user offline:", err.message || err)
      );

    markOnline();

    const heartbeatInterval = setInterval(markOnline, 30000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        markOffline();
      } else {
        markOnline();
      }
    };

    const handleBeforeUnload = () => {
      markOffline();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("pagehide", handleBeforeUnload);

    return () => {
      clearInterval(heartbeatInterval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("pagehide", handleBeforeUnload);
      markOffline();
    };
  }, [currentUser?.id]);

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
  }, [currentUser?.id, user?.id, chatId, fetchUserInfo, changeChat]);

  const updateTypingStatus = useCallback(
    async (typing) => {
      if (!chatId || !currentUser?.id) return;

      try {
        const chatRef = doc(db, "chats", chatId);
        if (typing) {
          await updateDoc(chatRef, {
            [`typing.${currentUser.id}`]: Date.now(),
          });
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
    },
    [chatId, currentUser?.id]
  );

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

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const previewUrl =
      file.type && file.type.startsWith("image/")
        ? URL.createObjectURL(file)
        : "";

    setFileData({ file, previewUrl });
    setShowFileMenu(false);
    e.target.value = "";

    if (isCurrentUserBlocked || isReceiverBlocked) return;

    handleSend({
      fileOverride: file,
      previewUrlOverride: previewUrl,
    });
  };

  const handleSend = useCallback(
    async ({ textOverride, fileOverride, previewUrlOverride } = {}) => {
      const textToSend = textOverride !== undefined ? textOverride : text || "";
      const fileToUpload = fileOverride ?? fileData.file;
      const previewUrlToRevoke =
        previewUrlOverride !== undefined
          ? previewUrlOverride
          : fileData.previewUrl;

      if (!textToSend && !fileToUpload) {
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

      updateTypingStatus(false);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

      setFileData({ file: null, previewUrl: "" });
      if (previewUrlToRevoke) {
        URL.revokeObjectURL(previewUrlToRevoke);
      }

      let uploadedFile = null;

      try {
        if (fileToUpload) {
          uploadedFile = await upload(fileToUpload);
        }

        const messageObj = {
          senderId: currentUser.id,
          text: textToSend || "",
          createdAt: new Date(),
          seenBy: [],
          deletedFor: [],
          ...(uploadedFile && { file: uploadedFile }),
        };

        const chatDocRef = doc(db, "chats", chatId);
        const chatDocSnap = await getDoc(chatDocRef);

        if (!chatDocSnap.exists()) {
          throw new Error(`Chat document does not exist: ${chatId}`);
        }

        await updateDoc(chatDocRef, {
          messages: arrayUnion(messageObj),
        });

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
                  data.chats[i].lastMessage =
                    textToSend || uploadedFile?.name || "File";
                  data.chats[i].isSeen = id === currentUser.id;
                  data.chats[i].updatedAt = Date.now();

                  await updateDoc(ref, { chats: data.chats });
                }
              }
            } catch (userChatErr) {
              console.error(`Error updating userchats for ${id}:`, userChatErr);
            }
          })
        );
      } catch (err) {
        console.error("❌ Error sending message:", err);

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
        setText("");
      }
    },
    [
      chatId,
      currentUser?.id,
      fileData.file,
      fileData.previewUrl,
      updateTypingStatus,
      user?.id,
      text,
    ]
  );

  const getStoragePathFromFile = (file) => {
    if (!file) return null;
    if (file.path) return file.path;
    if (!file.url) return null;

    try {
      const match = file.url.match(/\/o\/([^?]+)/);
      if (!match || !match[1]) return null;
      return decodeURIComponent(match[1]);
    } catch (err) {
      console.error("Failed to parse storage path from URL:", err);
      return null;
    }
  };

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
              const visibleMessages = updatedMessages.filter(
                (msg) => !msg.deletedFor?.includes(id)
              );

              if (visibleMessages.length > 0) {
                const lastMsg = visibleMessages[visibleMessages.length - 1];
                data.chats[i].lastMessage =
                  lastMsg.text || lastMsg.file?.name || "File";
                data.chats[i].updatedAt = Date.now();
              } else {
                data.chats[i].lastMessage = "No messages yet";
                data.chats[i].updatedAt = Date.now();
              }

              await updateDoc(ref, { chats: data.chats });
            }
          }
        } catch (err) {
          console.error(`Error updating userchats for ${id}:`, err);
        }
      })
    );
  };

  const handleDeleteMessage = async (
    messageIndex,
    deleteForEveryone = false
  ) => {
    if (!chatId || !currentUser?.id) return;

    setIsDeleting(true);
    try {
      const chatRef = doc(db, "chats", chatId);
      const chatSnap = await getDoc(chatRef);

      if (!chatSnap.exists()) return;

      const messages = chatSnap.data().messages || [];
      const message = messages[messageIndex];

      if (!message) {
        console.warn("Message not found for deletion");
        return;
      }

      if (deleteForEveryone && message.senderId !== currentUser.id) {
        alert("You can only delete your own messages for everyone");
        return;
      }

      const shouldDeleteForEveryone =
        deleteForEveryone && message.senderId === currentUser.id;
      const fileStoragePath = shouldDeleteForEveryone
        ? getStoragePathFromFile(message.file)
        : null;

      let updatedMessages;

      if (shouldDeleteForEveryone) {
        updatedMessages = messages.filter((_, idx) => idx !== messageIndex);
        await updateDoc(chatRef, { messages: updatedMessages });
      } else {
        updatedMessages = messages.map((msg, idx) => {
          if (idx === messageIndex) {
            const deletedForSet = new Set(msg.deletedFor || []);
            deletedForSet.add(currentUser.id);
            return {
              ...msg,
              deletedFor: Array.from(deletedForSet),
            };
          }
          return msg;
        });
        await updateDoc(chatRef, { messages: updatedMessages });
      }

      await updateLastMessageAfterDelete(updatedMessages);

      if (fileStoragePath) {
        try {
          const fileRef = storageRef(storage, fileStoragePath);
          await deleteObject(fileRef);
          console.log(`Deleted file from storage: ${fileStoragePath}`);
        } catch (storageErr) {
          console.error("Error deleting file from storage:", storageErr);
        }
      }

      setShowMessageMenu(null);
    } catch (err) {
      console.error("Error deleting message:", err);
      alert("Failed to delete message");
    } finally {
      setSuppressScrollOnce(true);
      setIsDeleting(false);
    }
  };

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      updateTypingStatus(false);
    };
  }, [chatId, updateTypingStatus]);

  useEffect(() => {
    if (isCurrentUserBlocked || isReceiverBlocked) setOpen(false);
  }, [isCurrentUserBlocked, isReceiverBlocked]);

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

  const handleMenuOpen = (index, config) => {
    setMessageMenuConfig(config);
    setShowMessageMenu(index);
  };

  const toggleEmoji = () => setOpen((prev) => !prev);
  const toggleFileMenu = () => setShowFileMenu((prev) => !prev);
  const handleBack = () => resetChat();
  const isBlocked = isCurrentUserBlocked || isReceiverBlocked;

  return {
    chatId,
    user,
    currentUser,
    open,
    setOpen,
    toggleEmoji,
    text,
    handleTyping,
    handleSend,
    handleFile,
    showFileMenu,
    toggleFileMenu,
    fileMenuRef,
    messageMenuRef,
    showMessageMenu,
    messageMenuConfig,
    handleDeleteMessage,
    receiverStatus,
    isTyping,
    visibleMessages,
    handleMenuOpen,
    isBlocked,
    handleBack,
    isDeleting,
    suppressScrollOnce,
    setSuppressScrollOnce,
  };
};

export default useChatController;
