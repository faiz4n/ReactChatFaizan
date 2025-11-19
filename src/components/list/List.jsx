import ChatList from "./chatList/ChatList"
import "./list.css"
import Userinfo from "./userInfo/Userinfo"

const List = ({ className }) => {
  return (
    <div className={`list ${className || ''}`}>
      <Userinfo/>
      <ChatList/>
    </div>
  )
}

export default List