import { useEffect, useRef } from "react";
import PropTypes from "prop-types";
import { format } from "timeago.js";

const MessageList = ({
  messages,
  currentUserId,
  otherUserId,
  showMessageMenu,
  menuConfig,
  onMenuOpen,
  messageMenuRef,
  onDeleteMessage,
}) => {
  const longPressTimeoutRef = useRef(null);

  const clearLongPressTimeout = () => {
    if (longPressTimeoutRef.current) {
      clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }
  };

  useEffect(() => () => clearLongPressTimeout(), []);

  const openMenu = (messageEl, originalIndex, isOwnMessage) => {
    const textEl = messageEl.querySelector(".texts") || messageEl;
    const centerEl = messageEl.closest(".center");
    const defaultAlign = isOwnMessage ? "right" : "left";

    if (!centerEl) {
      onMenuOpen(originalIndex, { placement: "above", align: defaultAlign });
      return;
    }

    const messageRect = textEl.getBoundingClientRect();
    const centerRect = centerEl.getBoundingClientRect();
    const minVertical = 170;
    const spaceAbove = messageRect.top - centerRect.top;
    const spaceBelow = centerRect.bottom - messageRect.bottom;
    const placement =
      spaceAbove < minVertical && spaceBelow > spaceAbove ? "below" : "above";

    const spaceRight = centerRect.right - messageRect.right;
    const spaceLeft = messageRect.left - centerRect.left;
    const minHorizontal = 210;
    let align = defaultAlign;

    if (
      align === "right" &&
      spaceRight < minHorizontal &&
      spaceLeft > spaceRight
    ) {
      align = "left";
    } else if (
      align === "left" &&
      spaceLeft < minHorizontal &&
      spaceRight > spaceLeft
    ) {
      align = "right";
    }

    onMenuOpen(originalIndex, { placement, align });
  };

  const handleContextMenu = (event, originalIndex, isOwnMessage) => {
    event.preventDefault();
    clearLongPressTimeout();
    openMenu(event.currentTarget, originalIndex, isOwnMessage);
  };

  const handleTouchStart = (event, originalIndex, isOwnMessage) => {
    clearLongPressTimeout();
    const target = event.currentTarget;
    longPressTimeoutRef.current = setTimeout(() => {
      openMenu(target, originalIndex, isOwnMessage);
      longPressTimeoutRef.current = null;
    }, 800);
  };

  return messages.map(({ message, originalIndex }) => {
    const isOwnMessage = message.senderId === currentUserId;
    const isSeen = isOwnMessage && message.seenBy?.includes(otherUserId);
    const isDelivered = isOwnMessage && message.seenBy?.length > 0;
    const messageKey =
      message.id ||
      message.createdAt?.seconds ||
      `${message.createdAt}-${originalIndex}`;

    return (
      <div
        className={`message ${isOwnMessage ? "own" : ""}`}
        key={messageKey}
        onContextMenu={(event) =>
          handleContextMenu(event, originalIndex, isOwnMessage)
        }
        onTouchStart={(event) =>
          handleTouchStart(event, originalIndex, isOwnMessage)
        }
        onTouchEnd={clearLongPressTimeout}
        onTouchMove={clearLongPressTimeout}
        onTouchCancel={clearLongPressTimeout}
      >
        <div className="texts">
          {message.file &&
            (message.file.type?.startsWith("image/") ||
              (!message.file.type &&
                /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(
                  message.file.name
                ))) && <img src={message.file.url} alt="" />}

          {message.file &&
            !message.file.type?.startsWith("image/") &&
            !(
              !message.file.type &&
              /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(message.file.name)
            ) && (
              <a
                href={message.file.url}
                download={message.file.name}
                target="_blank"
                rel="noreferrer"
                className="file-download"
              >
                <span className="file-icon" aria-hidden="true">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M9 12h6M9 16h6M14 3v4a1 1 0 0 0 1 1h4"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M6 3h8l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <span className="file-name">{message.file.name}</span>
              </a>
            )}

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

          {showMessageMenu === originalIndex && (
            <div
              className={`message-menu ${
                menuConfig.placement === "below" ? "menu-below" : "menu-above"
              } ${menuConfig.align === "left" ? "align-left" : "align-right"}`}
              ref={messageMenuRef}
              onClick={(event) => event.stopPropagation()}
            >
              {isOwnMessage && (
                <div
                  className="message-menu-item delete-everyone"
                  onClick={() => onDeleteMessage(originalIndex, true)}
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
                onClick={() => onDeleteMessage(originalIndex, false)}
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
      </div>
    );
  });
};

MessageList.propTypes = {
  messages: PropTypes.arrayOf(
    PropTypes.shape({
      message: PropTypes.object.isRequired,
      originalIndex: PropTypes.number.isRequired,
    })
  ).isRequired,
  currentUserId: PropTypes.string,
  otherUserId: PropTypes.string,
  showMessageMenu: PropTypes.number,
  menuConfig: PropTypes.shape({
    placement: PropTypes.oneOf(["above", "below"]).isRequired,
    align: PropTypes.oneOf(["left", "right"]).isRequired,
  }).isRequired,
  onMenuOpen: PropTypes.func.isRequired,
  messageMenuRef: PropTypes.object.isRequired,
  onDeleteMessage: PropTypes.func.isRequired,
};

export default MessageList;
