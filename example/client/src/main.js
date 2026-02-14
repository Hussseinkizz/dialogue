import { createDialogueClient } from "dialogue-ts/client";
import "./style.css";

// DOM elements - Login
const loginSection = document.getElementById("login-section");
const usernameInput = document.getElementById("username");
const loginBtn = document.getElementById("login-btn");

// DOM elements - Rooms
const roomsSection = document.getElementById("rooms-section");
const userDisplay = document.getElementById("user-display");
const roomList = document.getElementById("room-list");
const createRoomBtn = document.getElementById("create-room-btn");
const alertBtn = document.getElementById("alert-btn");

// DOM elements - Chat
const chatSection = document.getElementById("chat-section");
const roomTitle = document.getElementById("room-title");
const backBtn = document.getElementById("back-btn");
const leaveBtn = document.getElementById("leave-btn");
const messagesContainer = document.getElementById("messages");
const messageForm = document.getElementById("message-form");
const messageInput = document.getElementById("message");

// DOM elements - Modal
const createRoomModal = document.getElementById("create-room-modal");
const newRoomIdInput = document.getElementById("new-room-id");
const newRoomNameInput = document.getElementById("new-room-name");
const cancelCreateBtn = document.getElementById("cancel-create-btn");
const confirmCreateBtn = document.getElementById("confirm-create-btn");

// State
let client = null;
let username = "";
let currentRoom = null;
let currentRoomId = null;

/**
 * Shows a specific section and hides others
 */
function showSection(section) {
  loginSection.style.display = section === "login" ? "flex" : "none";
  roomsSection.style.display = section === "rooms" ? "flex" : "none";
  chatSection.style.display = section === "chat" ? "flex" : "none";
}

/**
 * Adds a chat message to the messages container
 * @param {string} sender - Username of the sender
 * @param {string} text - Message text
 * @param {boolean} isSelf - Is this message from the current user
 * @param {boolean} isHistory - Is this a historical message (will be prepended)
 */
function addMessage(sender, text, isSelf, isHistory = false) {
  const div = document.createElement("div");
  div.className = `message ${isSelf ? "self" : "other"}${isHistory ? " history" : ""}`;

  const senderSpan = document.createElement("span");
  senderSpan.className = "sender";
  senderSpan.textContent = sender;

  const textSpan = document.createElement("span");
  textSpan.className = "text";
  textSpan.textContent = text;

  div.appendChild(senderSpan);
  div.appendChild(textSpan);

  if (isHistory) {
    // Insert at the top for history messages
    messagesContainer.insertBefore(div, messagesContainer.firstChild);
  } else {
    messagesContainer.appendChild(div);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }
}

/**
 * Adds a system message to the messages container
 */
function addSystemMessage(text) {
  const div = document.createElement("div");
  div.className = "message system";
  div.textContent = text;
  messagesContainer.appendChild(div);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

/**
 * Adds an alert message to the messages container
 */
function addAlertMessage(text) {
  const div = document.createElement("div");
  div.className = "message alert";
  div.textContent = text;
  messagesContainer.appendChild(div);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

/**
 * Renders the room list
 */
async function renderRoomList() {
  if (!client) {
    return;
  }

  try {
    const rooms = await client.listRooms();
    roomList.innerHTML = "";

    if (rooms.length === 0) {
      roomList.innerHTML =
        '<p style="text-align:center;color:#888;padding:2rem;">No rooms available. Create one!</p>';
      return;
    }

    for (const room of rooms) {
      const item = document.createElement("div");
      item.className = "room-item";
      item.innerHTML = `
        <div class="room-info">
          <h4>${room.name}</h4>
          <p>${room.description || room.id}</p>
        </div>
        <div class="room-meta">
          ${room.size}${room.maxSize ? `/${room.maxSize}` : ""} users
        </div>
      `;
      item.addEventListener("click", () => joinRoom(room.id, room.name));
      roomList.appendChild(item);
    }
  } catch (error) {
    console.error("Failed to list rooms:", error);
  }
}

/**
 * Joins a room and shows the chat
 */
async function joinRoom(roomId, roomName) {
  try {
    currentRoom = await client.join(roomId);
    currentRoomId = roomId;
    roomTitle.textContent = roomName;
    messagesContainer.innerHTML = "";

    // Subscribe to all events in this room
    currentRoom.subscribeAll();

    // Listen for chat messages
    currentRoom.on("message", (msg) => {
      addMessage(
        msg.data.username,
        msg.data.text,
        msg.data.username === username
      );
    });

    // Listen for user joined events
    currentRoom.on("user-joined", (msg) => {
      if (msg.data.username !== username) {
        addSystemMessage(`${msg.data.username} joined the chat`);
      }
    });

    // Listen for user left events
    currentRoom.on("user-left", (msg) => {
      addSystemMessage(`${msg.data.username} left the chat`);
    });

    // Listen for alerts
    currentRoom.on("alert", (msg) => {
      const time = new Date(msg.data.timestamp).toLocaleTimeString();
      addAlertMessage(
        `[ALERT ${time}] ${msg.data.message} - by ${msg.data.triggeredBy}`
      );
    });

    // Notify others
    currentRoom.trigger("user-joined", { username });

    showSection("chat");
    messageInput.focus();
  } catch (error) {
    console.error("Failed to join room:", error);
    alert(`Failed to join room: ${error.message}`);
  }
}

/**
 * Leaves the current room
 */
function leaveRoom() {
  if (currentRoom) {
    currentRoom.trigger("user-left", { username });
    currentRoom.leave();
    currentRoom = null;
    currentRoomId = null;
  }
  showSection("rooms");
  renderRoomList();
}

/**
 * Handles login
 */
async function handleLogin() {
  username = usernameInput.value.trim();
  if (!username) {
    usernameInput.focus();
    return;
  }

  loginBtn.disabled = true;
  loginBtn.textContent = "Connecting...";

  try {
    client = createDialogueClient({
      url: "http://localhost:3000",
      auth: { userId: username },
    });

    await client.connect();

    // Listen for room changes
    client.onRoomCreated(() => {
      renderRoomList();
    });

    client.onRoomDeleted((roomId) => {
      if (currentRoomId === roomId) {
        alert("This room has been deleted");
        leaveRoom();
      }
      renderRoomList();
    });

    // Handle history sync when joining rooms
    client.onHistory((roomId, events) => {
      // Only process if we're in this room
      if (roomId !== currentRoomId) {
        return;
      }

      // Add a separator for historical messages
      if (events.length > 0) {
        addSystemMessage("--- Previous messages ---");
      }

      // Events are sorted newest first, we want oldest first for display
      const sortedEvents = [...events].reverse();

      for (const event of sortedEvents) {
        if (event.event === "message" && event.data) {
          addMessage(
            event.data.username,
            event.data.text,
            event.data.username === username
          );
        }
      }

      if (events.length > 0) {
        addSystemMessage("--- End of history ---");
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
      }
    });

    userDisplay.textContent = username;
    showSection("rooms");
    renderRoomList();
  } catch (error) {
    console.error("Failed to connect:", error);
    loginBtn.disabled = false;
    loginBtn.textContent = "Connect";
    alert("Failed to connect. Is the server running?");
  }
}

/**
 * Handles sending a message
 */
function handleSendMessage(event) {
  event.preventDefault();

  const text = messageInput.value.trim();
  if (!(text && currentRoom)) {
    return;
  }

  currentRoom.trigger("message", { text, username });
  messageInput.value = "";
  messageInput.focus();
}

/**
 * Shows create room modal
 */
function showCreateRoomModal() {
  newRoomIdInput.value = "";
  newRoomNameInput.value = "";
  createRoomModal.classList.add("active");
  newRoomIdInput.focus();
}

/**
 * Hides create room modal
 */
function hideCreateRoomModal() {
  createRoomModal.classList.remove("active");
}

/**
 * Creates a new room
 */
async function handleCreateRoom() {
  const id = newRoomIdInput.value.trim().toLowerCase().replace(/\s+/g, "-");
  const name = newRoomNameInput.value.trim();

  if (!(id && name)) {
    alert("Please fill in both fields");
    return;
  }

  try {
    await client.createRoom({ id, name });
    hideCreateRoomModal();
    renderRoomList();
  } catch (error) {
    console.error("Failed to create room:", error);
    alert(`Failed to create room: ${error.message}`);
  }
}

/**
 * Sends a global alert to all users in the current room
 */
function handleSendAlert() {
  if (!currentRoom) {
    alert("Join a room first to send alerts");
    return;
  }

  const timestamp = Date.now();
  const message = `Current server time: ${new Date(timestamp).toISOString()}`;

  currentRoom.trigger("alert", {
    message,
    timestamp,
    triggeredBy: username,
  });
}

// Event listeners
loginBtn.addEventListener("click", handleLogin);
usernameInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    handleLogin();
  }
});

createRoomBtn.addEventListener("click", showCreateRoomModal);
cancelCreateBtn.addEventListener("click", hideCreateRoomModal);
confirmCreateBtn.addEventListener("click", handleCreateRoom);

alertBtn.addEventListener("click", handleSendAlert);

backBtn.addEventListener("click", leaveRoom);
leaveBtn.addEventListener("click", leaveRoom);
messageForm.addEventListener("submit", handleSendMessage);

// Close modal on outside click
createRoomModal.addEventListener("click", (e) => {
  if (e.target === createRoomModal) {
    hideCreateRoomModal();
  }
});
