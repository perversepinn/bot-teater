const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder
} = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

/* ================= KONFIGURASI ================= */
const TOKEN = process.env.TOKEN;

const GERBANG_CHANNEL_ID = "1462897731327623359";
const TEATER_CHANNEL_ID = "948549667480805392";
const TIKET_ROLE_ID     = "1462896452543054017";
const LOKET_TEXT_ID     = "1462914087536037960";
const PENGUMUMAN_TEXT_ID     = "1462953258778759293";
const PENGASINGAN_CHANNEL_ID = "1376173778131746956";

// voice
const {
  joinVoiceChannel
} = require('@discordjs/voice');

const {
  getVoiceConnection
} = require('@discordjs/voice');

// ROLE ADMIN UNTUK OVERRIDE
const ADMIN_ROLE_ID     = "1263153229668290591";
const OWNER_ID = "863369610291314689";
const CLIENT_ID = "1462924301026988062";
const GUILD_ID = "948549667480805386";

// JAM LOKET (WIB)
// const OPEN_HOUR   = 20;
// const OPEN_MINUTE = 24;

// const CLOSE_HOUR   = 21;
// const CLOSE_MINUTE = 0;
/* =============================================== */

let customSchedule = {
  openHour: null,
  openMinute: null,
  closeHour: null,
  closeMinute: null
};

let forcedState = null; // null = otomatis | true = buka | false = tutup
let lastState = null;
let warned = false;
let lastAnnouncementMessageId = null;
let countdownMessageId = null;
let scheduleUsed = false;

/* ====== UTIL WAKTU ====== */
function getWIBMinutes() {
  const now = new Date();
  const hour = (now.getUTCHours() + 7) % 24;
  const minute = now.getUTCMinutes();
  return hour * 60 + minute;
}

function isLoketOpen() {
  if (
    customSchedule.openHour === null ||
    customSchedule.closeHour === null
  ) {
    return false;
  }

  if (scheduleUsed) return false;

  const now = getWIBMinutes();

  const open = customSchedule.openHour * 60 + customSchedule.openMinute;
  const close = customSchedule.closeHour * 60 + customSchedule.closeMinute;

  return now >= open && now < close;
}

function getPengumumanChannel(guild) {
  return guild.channels.cache.get(PENGUMUMAN_TEXT_ID);
}

// hapus kirim pengumuman
async function sendAnnouncement(guild, content) {
  const channel = guild.channels.cache.get(PENGUMUMAN_TEXT_ID);
  if (!channel) return;

  // Hapus pesan sebelumnya
  if (lastAnnouncementMessageId) {
    try {
      const oldMsg = await channel.messages.fetch(lastAnnouncementMessageId);
      await oldMsg.delete();
    } catch (_) {}
  }

  // Kirim pesan baru
  const newMsg = await channel.send(content);
  lastAnnouncementMessageId = newMsg.id;
}

/* ====== UPDATE LOKET ====== */
async function updateLoket(guild, silent = false) {
  const loket = guild.channels.cache.get(LOKET_TEXT_ID);
  const pengumuman = getPengumumanChannel(guild);
  if (!loket || !pengumuman) return;

  const open = forcedState !== null ? forcedState : isLoketOpen();

  // Saat bot baru hidup, sync tanpa kirim pengumuman
  if (lastState === null && silent) {
    lastState = open;

    await loket.permissionOverwrites.edit(
      guild.roles.everyone,
      {
        ViewChannel: open,
        SendMessages: open
      }
    );

    return;
  }

  // Paksa perubahan pertama setelah command tetap dianggap perubahan
  if (lastState === null) {
    lastState = !open;
  }

  if (open === lastState) return;

  lastState = open;
  warned = false;

  await loket.permissionOverwrites.edit(
    guild.roles.everyone,
    {
      ViewChannel: open,
      SendMessages: open
    }
  );

  if (open) {
    await sendAnnouncement(
      guild,
      '🔔 **LOKET TIKET ISTANA TELAH DIBUKA!** 🎟️\nSilakan menuju https://discord.com/channels/948549667480805386/1462914087536037960 untuk mengambil tiket.\n@everyone'
    );
  } else {
    // Hapus pesan countdown jika ada
    if (countdownMessageId) {
      try {
        const channel = guild.channels.cache.get(PENGUMUMAN_TEXT_ID);
        const msg = await channel.messages.fetch(countdownMessageId);
        await msg.delete();
      } catch (_) {}

      countdownMessageId = null;
    }

    // Hapus pesan pengumuman sebelumnya jika ada
    if (lastAnnouncementMessageId) {
      try {
        const oldMsg = await pengumuman.messages.fetch(lastAnnouncementMessageId);
        await oldMsg.delete();
      } catch (_) {}
    }

const msg = await pengumuman.send(
  "\n🔒 **LOKET TIKET ISTANA TELAH DITUTUP.**\nSampai pemutaran berikutnya 🎬\n@everyone"
);

// Simpan ID pesan terbaru
lastAnnouncementMessageId = msg.id;

// Tandai jadwal sudah dipakai
scheduleUsed = true;

// Hapus pesan tutup setelah 1 menit
setTimeout(() => {
  msg.delete().catch(() => {});
}, 60 * 1000);
  }
}


/* ====== WARNING 5 MENIT ====== */
async function countdownWarning(guild) {
  if (!isLoketOpen() || warned) return;

  const now = getWIBMinutes();
  const close = customSchedule.closeHour * 60 + customSchedule.closeMinute;

  if (close - now === 5) {
    const channel = guild.channels.cache.get(PENGUMUMAN_TEXT_ID);
    if (!channel) return;

    const msg = await channel.send(
      "\n⏳ **PERINGATAN ISTANA**\nLoket tiket akan ditutup dalam **5 menit**! 🎟️\n@everyone"
    );

    countdownMessageId = msg.id;
    warned = true;
  }
}

async function clearBotAnnouncements(guild) {
  const channel = guild.channels.cache.get(PENGUMUMAN_TEXT_ID);
  if (!channel) return;

  try {
    const messages = await channel.messages.fetch({ limit: 100 });

    const botMessages = messages.filter(
      msg => msg.author.id === client.user.id
    );

    for (const [, msg] of botMessages) {
      await msg.delete().catch(() => {});
    }

    console.log(`🧹 Pesan pengumuman bot dibersihkan`);
  } catch (err) {
    console.error(err);
  }
}

/* ====== BOT READY ====== */
client.once('clientReady', async () => {
  console.log(`🤖 Bot aktif sebagai ${client.user.tag}`);
client.user.setPresence({
  activities: [
    {
      name: "my king's heartbeat",
      type: 2
    }
  ],
  status: 'online'
});
  for (const guild of client.guilds.cache.values()) {
    await clearBotAnnouncements(guild);
    await updateLoket(guild, true);
  }

  setInterval(() => {
    client.guilds.cache.forEach(guild => {
      updateLoket(guild);
      countdownWarning(guild);
    });
  }, 60 * 1000);
});

/* ====== AUTO PINDAH VOICE ====== */
client.on('voiceStateUpdate', async (_, newState) => {
  // Abaikan semua bot (termasuk Jockie)
  if (newState.member.user.bot) return;

  if (newState.channel?.id !== GERBANG_CHANNEL_ID) return;

  const member = newState.member;

  if (member.roles.cache.has(TIKET_ROLE_ID)) {
    await member.voice.setChannel(TEATER_CHANNEL_ID).catch(() => {});
  } else {
    await member.voice.disconnect().catch(() => {});
  }
});

/* ====== PESAN SEMENTARA SAAT AMBIL TIKET ====== */
client.on('guildMemberUpdate', async (oldMember, newMember) => {
  if (
    !oldMember.roles.cache.has(TIKET_ROLE_ID) &&
    newMember.roles.cache.has(TIKET_ROLE_ID)
  ) {
    const channel = newMember.guild.channels.cache.get(LOKET_TEXT_ID);
    if (!channel) return;

    const msg = await channel.send(
      `${newMember}\n🎟️ **Tiket berhasil diambil!**\n` +
      `Silahkan menuju ke: 🚪 <#${GERBANG_CHANNEL_ID}>`
    );

    setTimeout(() => msg.delete().catch(() => {}), 10000);
  }
});

/* ====== Deafen ====== */
client.on('voiceStateUpdate', async (oldState, newState) => {
  // Abaikan semua bot (termasuk Jockie)
  if (newState.member.user.bot) return;

  const member = newState.member;

  // Kalau user sedang self deafen di voice channel mana pun
  if (newState.selfDeaf && newState.channel) {
    // Jangan loop kalau sudah di Hutan Pengasingan
    if (newState.channel.id === PENGASINGAN_CHANNEL_ID) return;

    try {
      await member.voice.setChannel(PENGASINGAN_CHANNEL_ID);
      console.log(`🌲 ${member.user.username} dipindahkan ke Hutan Pengasingan`);
    } catch (err) {
      console.error(err);
    }
  }
});

async function sendTemporaryReply(message, content) {
  try {
    // Reply ke pesan user
    const reply = await message.reply(content);

    // Hapus pesan user + reply bot setelah 10 detik
    setTimeout(async () => {
      await reply.delete().catch(() => {});
      await message.delete().catch(() => {});
    }, 7000);

    return reply;
  } catch (err) {
    console.error(err);
  }
}

/* ====== ADMIN OVERRIDE ====== */
client.on('messageCreate', async message => {
  if (message.author.bot) return;
  if (!message.member.roles.cache.has(ADMIN_ROLE_ID)) return;

  if (message.content === "!loket buka") {
    forcedState = true;
    lastState = null;

    if (message.guild) {
      updateLoket(message.guild);
    }

    return sendTemporaryReply(
      message,
      "👑 Loket DIPAKSA DIBUKA"
    );
  }

  if (message.content === "!loket tutup") {
    forcedState = false;
    lastState = null;

    if (message.guild) {
      updateLoket(message.guild);
    }

    return sendTemporaryReply(
      message,
      "👑 Loket DIPAKSA DITUTUP"
    );
  }


  if (message.content === "!loket cek") {
  const jadwalKosong =
    customSchedule.openHour === null ||
    customSchedule.closeHour === null;

  if (jadwalKosong) {
    return sendTemporaryReply(
      message,
      "📜 **JADWAL LOKET ISTANA**\n" +
      "Saat ini belum ada jadwal yang ditetapkan untuk pembukaan loket tiket."
    );
  }

  return sendTemporaryReply(
    message,
    "📜 **JADWAL LOKET ISTANA**\n" +
    `🟢 Dibuka : ${String(customSchedule.openHour).padStart(2, '0')}:${String(customSchedule.openMinute).padStart(2, '0')} WIB\n` +
    `🔴 Ditutup : ${String(customSchedule.closeHour).padStart(2, '0')}:${String(customSchedule.closeMinute).padStart(2, '0')} WIB`
  );
}

if (message.content.startsWith("!loket jadwal")) {
  const args = message.content.split(" ");

  // Format: !loket jadwal 18:30 21:15
  if (args.length < 4) {
    return sendTemporaryReply(
      message,
      "Format salah. Gunakan: `!loket jadwal 18:30 21:15`"
    );
  }

  const openTime = args[2].split(":");
  const closeTime = args[3].split(":");

  const openHour = parseInt(openTime[0]);
  const openMinute = parseInt(openTime[1]);
  const closeHour = parseInt(closeTime[0]);
  const closeMinute = parseInt(closeTime[1]);

  if (
    isNaN(openHour) ||
    isNaN(openMinute) ||
    isNaN(closeHour) ||
    isNaN(closeMinute)
  ) {
    return sendTemporaryReply(
      message,
      "Jam tidak valid. Gunakan format seperti: `!loket jadwal 18:30 21:15`"
    );
  }

  customSchedule.openHour = openHour;
  customSchedule.openMinute = openMinute;
  customSchedule.closeHour = closeHour;
  customSchedule.closeMinute = closeMinute;

  forcedState = null;
  warned = false;
  lastState = null;
  scheduleUsed = false;

  if (message.guild) {
    updateLoket(message.guild);
  }

  return sendTemporaryReply(
    message,
    `🕒 Jadwal loket diperbarui.\n` +
    `Buka: ${String(openHour).padStart(2, '0')}:${String(openMinute).padStart(2, '0')} WIB\n` +
    `Tutup: ${String(closeHour).padStart(2, '0')}:${String(closeMinute).padStart(2, '0')} WIB`
  );
}

if (message.content === "!loket hapus") {
  customSchedule.openHour = null;
  customSchedule.openMinute = null;
  customSchedule.closeHour = null;
  customSchedule.closeMinute = null;

  forcedState = false;
  warned = false;
  lastState = null;
  scheduleUsed = true;

  if (message.guild) {
    updateLoket(message.guild);
  }

  return sendTemporaryReply(
    message,
    "🗑️ Jadwal loket berhasil dihapus"
  );
}

if (message.content === "!join") {
  if (!message.member.voice.channel) {
    return sendTemporaryReply(
      message,
      "❌ Kamu harus berada di voice channel dulu"
    );
  }

  try {
    joinVoiceChannel({
      channelId: message.member.voice.channel.id,
      guildId: message.guild.id,
      adapterCreator: message.guild.voiceAdapterCreator,
      selfDeaf: false,
      selfMute: true
    });

    return sendTemporaryReply(
      message,
      "🎤 Bot masuk ke voice channel"
    );
  } catch (err) {
    console.error(err);

    return sendTemporaryReply(
      message,
      "❌ Gagal masuk ke voice channel"
    );
  }
}

if (message.content === "!leave") {
  const connection = getVoiceConnection(message.guild.id);

  if (connection) {
    connection.destroy();
  }

  return sendTemporaryReply(
    message,
    "👋 Bot keluar dari voice channel"
  );
}

});

const fs = require('fs');

let lastMessageContent = '';

setInterval(async () => {
  try {
    // pastikan file ada
    if (!fs.existsSync('channel.txt')) return;
    if (!fs.existsSync('pesan.txt')) return;

    const channelId = fs.readFileSync('channel.txt', 'utf8').trim();
    const text = fs.readFileSync('pesan.txt', 'utf8').trim();

    // kalau kosong jangan kirim
    if (!channelId || !text) return;

    // supaya pesan yang sama tidak terkirim berkali-kali
    const combined = `${channelId}|${text}`;
    if (combined === lastMessageContent) return;

    lastMessageContent = combined;

    const channel = await client.channels.fetch(channelId);

    if (!channel || !channel.isTextBased()) {
      console.log('❌ Channel tidak valid');
      return;
    }

    await channel.send(text);
    console.log(`📨 Pesan berhasil dikirim ke ${channel.name}`);

    // kosongkan pesan setelah terkirim
    fs.writeFileSync('pesan.txt', '');
  } catch (err) {
    console.error(err);
  }
}, 2000);

const commands = [
  new SlashCommandBuilder()
    .setName('announce')
    .setDescription('Kirim pesan ke channel pengumuman')
    .addStringOption(option =>
      option
        .setName('pesan')
        .setDescription('Isi pesan')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('say')
    .setDescription('Kirim pesan ke channel tertentu')
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('Pilih channel tujuan')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('pesan')
        .setDescription('Isi pesan')
        .setRequired(true)
    ),
  
  new SlashCommandBuilder()
  .setName('reply')
  .setDescription('Balas pesan tertentu')
  .addStringOption(option =>
    option
      .setName('messageid')
      .setDescription('ID pesan yang mau dibalas')
      .setRequired(true)
  )
  .addStringOption(option =>
    option
      .setName('pesan')
      .setDescription('Isi balasan')
      .setRequired(true)
  )
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  try {
    console.log('🔄 Mendaftarkan slash command...');

    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );

    console.log('✅ Slash command berhasil didaftarkan');
  } catch (error) {
    console.error(error);
  }
})();

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.user.id !== OWNER_ID) {
    return interaction.reply({
      content: '❌ Kamu tidak punya izin menggunakan command ini',
      ephemeral: true
    });
  }

  if (interaction.commandName === 'announce') {
    const text = interaction.options.getString('pesan');
    const channel = interaction.guild.channels.cache.get(PENGUMUMAN_TEXT_ID);

    if (!channel) {
      return interaction.reply({
        content: '❌ Channel pengumuman tidak ditemukan',
        ephemeral: true
      });
    }

    try {
      await channel.send(text);

      return interaction.reply({
        content: '📨 Pesan berhasil dikirim ke channel pengumuman',
        ephemeral: true
      });
    } catch (err) {
      console.error(err);

      return interaction.reply({
        content: '❌ Gagal mengirim pesan',
        ephemeral: true
      });
    }
  }

  if (interaction.commandName === 'say') {
    const channel = interaction.options.getChannel('channel');
    const text = interaction.options.getString('pesan');

    if (!channel || !channel.isTextBased()) {
      return interaction.reply({
        content: '❌ Channel tidak valid',
        ephemeral: true
      });
    }

    try {
      await channel.send(text);

      return interaction.reply({
        content: `📨 Pesan berhasil dikirim ke ${channel.name}`,
        ephemeral: true
      });
    } catch (err) {
      console.error(err);

      return interaction.reply({
        content: '❌ Gagal mengirim pesan',
        ephemeral: true
      });
    }
  }

  if (interaction.commandName === 'reply') {
  const messageId = interaction.options.getString('messageid');
  const text = interaction.options.getString('pesan');

  try {
    const channel = interaction.channel;

    const targetMessage = await channel.messages.fetch(messageId);

    if (!targetMessage) {
      return interaction.reply({
        content: '❌ Pesan tidak ditemukan',
        ephemeral: true
      });
    }

    await targetMessage.reply(text);

    return interaction.reply({
      content: '📨 Balasan berhasil dikirim',
      ephemeral: true
    });
  } catch (err) {
    console.error(err);

    return interaction.reply({
      content: '❌ Gagal membalas pesan',
      ephemeral: true
    });
  }
}
});

client.login(TOKEN);
