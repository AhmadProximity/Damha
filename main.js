// ===============================
// main.js (multi-percakapan + status pesan + auto-refresh + preview attachments)
// ===============================

const chatBox = document.getElementById("chat-box");
const urlParams = new URLSearchParams(window.location.search);
const conversationId = urlParams.get("conversation_id") || 1;
const senderId = 1;
let lastMessageId = null;

// ======================================================
// Utility UI
// ======================================================
function addBubble(text, type, time = null, status = null) {
  const chat = document.createElement("div");
  chat.className = `chat ${type}`;
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.innerHTML = text;

  const meta = document.createElement("div");
  meta.className = "text-xs text-gray-500 mt-1";
  if (time) meta.innerHTML = new Date(time).toLocaleTimeString();
  if (status) meta.innerHTML += ` ${renderStatusIcon(status)}`;
  bubble.appendChild(meta);

  const avatar = document.createElement("img");
  avatar.className = "avatar";
  avatar.src =
    type === "server"
      ? "https://cdn-icons-png.flaticon.com/512/4712/4712109.png"
      : "https://cdn-icons-png.flaticon.com/512/9131/9131529.png";

  if (type === "server") {
    chat.appendChild(avatar);
    chat.appendChild(bubble);
  } else {
    chat.appendChild(bubble);
    chat.appendChild(avatar);
  }

  chatBox.appendChild(chat);
  chatBox.scrollTop = chatBox.scrollHeight;
}

function renderStatusIcon(status) {
  switch (status) {
    case "sent":
      return "🕓";
    case "delivered":
      return "✅";
    case "read":
      return "✅✅";
    default:
      return "";
  }
}

function showTyping() {
  const typingDiv = document.createElement("div");
  typingDiv.className = "chat server typingDiv";
  typingDiv.innerHTML = `
    <img src="https://cdn-icons-png.flaticon.com/512/4712/4712109.png" class="avatar">
    <div class="typing">AES Bot sedang mengetik...</div>
  `;
  chatBox.appendChild(typingDiv);
  chatBox.scrollTop = chatBox.scrollHeight;
}

function removeTyping() {
  const typing = document.querySelector(".typingDiv");
  if (typing) typing.remove();
}

// ======================================================
// Load pesan dari DB
// ======================================================
async function loadMessages(initialLoad = false) {
  try {
    const res = await fetch(`/api/messages/${conversationId}`);
    const data = await res.json();
    if (!data.messages || data.messages.length === 0) {
      if (initialLoad)
        addBubble("Halo 👋! Saya <b>AES Bot</b>. Ketik pesan lalu tekan <b>Encrypt</b>.", "server");
      return;
    }

    if (initialLoad) chatBox.innerHTML = "";

    const newMessages = data.messages.filter((m) => !lastMessageId || m.id > lastMessageId);

    if (newMessages.length > 0) {
      newMessages.forEach((m) => {
        const isUser = m.sender_id == senderId;
        const time = m.created_at;
        const status = m.status || "sent";
        let content = "";

        if (m.message_type === "attachment") {
          content = renderAttachmentPreview(m.content_plain);
        } else {
          content = m.content_ciphertext
            ? `<code>${m.content_ciphertext}</code>`
            : m.content_plain || "";
        }

        addBubble(content, isUser ? "user" : "server", time, status);
      });

      lastMessageId = data.messages[data.messages.length - 1].id;
      chatBox.scrollTop = chatBox.scrollHeight;
    }
  } catch (err) {
    if (initialLoad) addBubble(`<b>Error memuat pesan:</b> ${err}`, "server");
  }
}

// ======================================================
// Preview attachment
// ======================================================
function renderAttachmentPreview(filename) {
  const ext = filename.split(".").pop().toLowerCase();
  const fileUrl = `/uploads/${filename}`;

  if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) {
    return `
      <div class="inline-block">
        <img src="${fileUrl}" alt="${filename}" class="max-w-[200px] rounded-lg shadow-md cursor-pointer hover:opacity-90"
             onclick="window.open('${fileUrl}','_blank')">
      </div>
    `;
  } else if (ext === "pdf") {
    return `
      <div class="flex items-center gap-2">
        📄 <a href="${fileUrl}" target="_blank" class="text-blue-600 underline">Lihat PDF</a>
      </div>
    `;
  } else {
    return `
      <div>
        📎 <a href="${fileUrl}" target="_blank" class="text-blue-600 underline">${filename}</a>
      </div>
    `;
  }
}

// ======================================================
// Enkripsi pesan teks
// ======================================================
async function encryptMessage() {
  const message = document.getElementById("message").value.trim();
  if (!message) return alert("Pesan tidak boleh kosong!");

  addBubble(message, "user", new Date(), "sent");
  document.getElementById("message").value = "";
  showTyping();

  try {
    const formData = new FormData();
    formData.append("sender_id", senderId);
    formData.append("message", message);

    const res = await fetch(`/api/messages/${conversationId}`, {
      method: "POST",
      body: formData,
    });
    const data = await res.json();
    removeTyping();

    if (data.error) {
      addBubble(`<b>Error:</b> ${data.error}`, "server");
      return;
    }

    addBubble(
      `
      🔐 <b>Hasil Enkripsi:</b><br>
      <span class='text-sm text-gray-700'>Cipher:</span> <code>${data.cipher_b64}</code><br>
      <span class='text-sm text-gray-700'>Nonce:</span> <code>${data.nonce_b64}</code><br>
      <span class='text-sm text-gray-700'>Key:</span> <code>${data.key_hex}</code>
      `,
      "server"
    );

    lastMessageId = data.message_id;
    await updateMessageStatus(data.message_id, senderId, "sent");
  } catch (err) {
    removeTyping();
    addBubble(`<b>Error koneksi:</b> ${err}`, "server");
  }
}

// ======================================================
// Upload File Attachment + preview
// ======================================================
async function uploadAttachment() {
  const fileInput = document.getElementById("fileInput");
  if (!fileInput.files.length) return;
  const file = fileInput.files[0];

  const formData = new FormData();
  formData.append("file", file);
  formData.append("sender_id", senderId);
  formData.append("conversation_id", conversationId);

  try {
    const res = await fetch("/api/attachments/upload", {
      method: "POST",
      body: formData,
    });
    const data = await res.json();

    if (data.error) {
      addBubble(`<b>Error:</b> ${data.error}`, "server");
      return;
    }

    const preview = renderAttachmentPreview(data.filename);
    addBubble(preview, "user", new Date(), "sent");

    await updateMessageStatus(data.message_id, senderId, "sent");
    fileInput.value = "";
  } catch (err) {
    addBubble(`<b>Error upload:</b> ${err}`, "server");
  }
}

// ======================================================
// Dekripsi pesan terakhir
// ======================================================
async function decryptLastMessage() {
  if (!lastMessageId) return alert("Belum ada pesan untuk didekripsi!");
  showTyping();

  try {
    const res = await fetch(`/api/messages/decrypt/${lastMessageId}`);
    const data = await res.json();
    removeTyping();

    if (data.error) {
      addBubble(`<b>Error:</b> ${data.error}`, "server");
    } else {
      addBubble(`💬 <b>Pesan Asli:</b> ${data.plaintext}`, "server");
      await updateMessageStatus(lastMessageId, senderId, "read");
    }
  } catch (err) {
    removeTyping();
    addBubble(`<b>Error koneksi:</b> ${err}`, "server");
  }
}

// ======================================================
// Status pesan
// ======================================================
async function updateMessageStatus(messageId, userId, status) {
  try {
    await fetch("/api/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message_id: messageId, user_id: userId, status }),
    });
  } catch (err) {
    console.error("Gagal update status:", err);
  }
}

// ======================================================
// Hapus semua pesan
// ======================================================
async function clearConversation() {
  if (!confirm("Hapus semua pesan di percakapan ini?")) return;
  try {
    await fetch(`/api/messages/clear/${conversationId}`, { method: "POST" });
    chatBox.innerHTML = "";
    addBubble("Percakapan telah dikosongkan 💬", "server");
  } catch (err) {
    addBubble(`<b>Error:</b> ${err}`, "server");
  }
}

// ======================================================
// Auto refresh chat
// ======================================================
document.addEventListener("DOMContentLoaded", () => {
  loadMessages(true);
  setInterval(() => loadMessages(), 4000);
});
