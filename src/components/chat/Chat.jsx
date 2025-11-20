import { useEffect, useRef } from "react";
import "./chat.css";
import ChatHeader from "./ChatHeader";
import MessageList from "./MessageList";
import ChatInput from "./ChatInput";
import useChatController from "./useChatController";

const Chat = () => {
  const endRef = useRef(null);
  const prevVisibleCountRef = useRef(0);
  const {
    chatId,
    user,
    currentUser,
    open,
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
  } = useChatController();

  useEffect(() => {
    const currentCount = visibleMessages.length;
    const prevCount = prevVisibleCountRef.current;
    prevVisibleCountRef.current = currentCount;

    if (isDeleting) return;
    if (suppressScrollOnce) {
      setSuppressScrollOnce(false);
      return;
    }

    const shouldScroll =
      currentCount === 0 ? false : prevCount === 0 || currentCount > prevCount;

    if (!shouldScroll) return;

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
  }, [visibleMessages, isDeleting, suppressScrollOnce, setSuppressScrollOnce]);

  return (
    <div className={`chat ${chatId ? "mobile-visible" : ""}`}>
      <ChatHeader
        user={user}
        receiverStatus={receiverStatus}
        isTyping={isTyping}
        onBack={handleBack}
      />

      <div className="center">
        <MessageList
          messages={visibleMessages}
          currentUserId={currentUser?.id}
          otherUserId={user?.id}
          showMessageMenu={showMessageMenu}
          menuConfig={messageMenuConfig}
          onMenuOpen={handleMenuOpen}
          messageMenuRef={messageMenuRef}
          onDeleteMessage={handleDeleteMessage}
        />
        <div ref={endRef}></div>
      </div>

      <ChatInput
        text={text}
        onTextChange={handleTyping}
        onSend={handleSend}
        isBlocked={isBlocked}
        isEmojiOpen={open}
        onToggleEmoji={toggleEmoji}
        onEmojiSelect={(emoji) => handleTyping(text + emoji)}
        showFileMenu={showFileMenu}
        onToggleFileMenu={toggleFileMenu}
        fileMenuRef={fileMenuRef}
        onFileChange={handleFile}
      />
    </div>
  );
};

export default Chat;
