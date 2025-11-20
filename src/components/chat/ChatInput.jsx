import { useRef } from "react";
import PropTypes from "prop-types";
import EmojiPicker from "emoji-picker-react";

const ChatInput = ({
  text,
  onTextChange,
  onSend,
  isBlocked,
  isEmojiOpen,
  onToggleEmoji,
  onEmojiSelect,
  showFileMenu,
  onToggleFileMenu,
  fileMenuRef,
  onFileChange,
}) => {
  const imageInputRef = useRef(null);
  const documentInputRef = useRef(null);

  const handleImageSelect = () => {
    if (imageInputRef.current) imageInputRef.current.click();
  };

  const handleDocumentSelect = () => {
    if (documentInputRef.current) documentInputRef.current.click();
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter") onSend();
  };

  return (
    <div className="bottom">
      <div className="icons">
        <div className="file-menu-container">
          <button
            className="file-menu-trigger"
            onClick={() => !isBlocked && onToggleFileMenu()}
            disabled={isBlocked}
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

          {showFileMenu && (
            <div className="file-menu" ref={fileMenuRef}>
              <div
                className="file-menu-item"
                onClick={handleImageSelect}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
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
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
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
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
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

          <input
            type="file"
            ref={imageInputRef}
            style={{ display: "none" }}
            onChange={onFileChange}
            disabled={isBlocked}
            accept="image/*"
          />
          <input
            type="file"
            ref={documentInputRef}
            style={{ display: "none" }}
            onChange={onFileChange}
            disabled={isBlocked}
            accept="*"
          />
        </div>
      </div>

      <input
        type="text"
        placeholder={isBlocked ? "You cannot send a message" : "Type a message..."}
        value={text}
        onChange={(event) => onTextChange(event.target.value)}
        onKeyDown={handleKeyDown}
        disabled={isBlocked}
      />

      <div className="emoji">
        <img
          src="./emoji.png"
          alt=""
          onClick={() => !isBlocked && onToggleEmoji()}
        />
        <div className="picker">
          <EmojiPicker
            open={isEmojiOpen}
            onEmojiClick={(emoji) => onEmojiSelect(emoji.emoji)}
          />
        </div>
      </div>

      <button
        className="sendButton"
        onClick={onSend}
        disabled={isBlocked}
        type="button"
      >
        Send
      </button>
    </div>
  );
};

ChatInput.propTypes = {
  text: PropTypes.string.isRequired,
  onTextChange: PropTypes.func.isRequired,
  onSend: PropTypes.func.isRequired,
  isBlocked: PropTypes.bool.isRequired,
  isEmojiOpen: PropTypes.bool.isRequired,
  onToggleEmoji: PropTypes.func.isRequired,
  onEmojiSelect: PropTypes.func.isRequired,
  showFileMenu: PropTypes.bool.isRequired,
  onToggleFileMenu: PropTypes.func.isRequired,
  fileMenuRef: PropTypes.object.isRequired,
  onFileChange: PropTypes.func.isRequired,
};

export default ChatInput;

