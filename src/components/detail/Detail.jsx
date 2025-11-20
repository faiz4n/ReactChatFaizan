import { arrayRemove, arrayUnion, doc, updateDoc } from "firebase/firestore";
import { useChatStore } from "../../lib/chatStore";
import { auth, db } from "../../lib/firebase";
import { useUserStore } from "../../lib/userStore";
import "./detail.css";

const Detail = () => {
  const {
    chatId,
    user,
    isCurrentUserBlocked,
    isReceiverBlocked,
    changeBlock,
    changeChat,
    resetChat,
  } = useChatStore();
  const { currentUser, fetchUserInfo } = useUserStore();

  const handleBlock = async () => {
    if (!user) return;

    const userDocRef = doc(db, "users", currentUser.id);

    try {
      await updateDoc(userDocRef, {
        blocked: isReceiverBlocked ? arrayRemove(user.id) : arrayUnion(user.id),
      });

      await fetchUserInfo(currentUser.id);

      changeChat(chatId, user);
    } catch (err) {
      console.log(err);
    }
  };

  const handleLogout = () => {
    auth.signOut();
    resetChat();
  };

  const handleCloseDetail = () => {
    const detailPanel = document.querySelector(".detail");
    if (detailPanel) {
      detailPanel.classList.remove("mobile-visible");
    }
  };

  return (
    <div className="detail">
      <button
        className="close-detail-button"
        onClick={handleCloseDetail}
        aria-label="Close"
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
      <div className="user">
        <img src={user?.avatar.url || "./avatar.png"} alt="" />
        <h2>{user?.username}</h2>
        {/* <p>Lorem ipsum dolor sit amet.</p> */}
      </div>
      <div className="info">
        <button onClick={handleBlock}>
          {isCurrentUserBlocked
            ? "You are Blocked!"
            : isReceiverBlocked
            ? "Unblock User"
            : "Block User"}
        </button>
        <button className="logout" onClick={handleLogout}>
          Logout
        </button>
      </div>
    </div>
  );
};

export default Detail;
