import PropTypes from "prop-types";
import { format } from "timeago.js";

const formatLastSeen = (lastSeen) => {
  if (!lastSeen) return "";
  if (lastSeen?.toDate) return format(lastSeen.toDate());
  if (lastSeen instanceof Date) return format(lastSeen);
  if (lastSeen?.seconds) return format(new Date(lastSeen.seconds * 1000));
  return format(new Date(lastSeen));
};

const ChatHeader = ({ user, receiverStatus, isTyping, onBack }) => (
  <div className="top">
    <div className="user">
      <button className="back-button" onClick={onBack}>
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
          document.querySelector(".detail")?.classList.toggle("mobile-visible")
        }
      />
    </div>
  </div>
);

ChatHeader.propTypes = {
  user: PropTypes.object,
  receiverStatus: PropTypes.shape({
    isOnline: PropTypes.bool,
    lastSeen: PropTypes.oneOfType([PropTypes.object, PropTypes.instanceOf(Date)]),
  }).isRequired,
  isTyping: PropTypes.bool.isRequired,
  onBack: PropTypes.func.isRequired,
};

export default ChatHeader;

