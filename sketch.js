// ========== 益迪的畫布動畫（p5.js）==========
// chat.js 只需要操作下面的 avatar 物件，不用管畫面細節：
//   avatar.setEmotion('normal'|'think'|'happy'|'panic'|'anxious'|'worried')
//   avatar.setSpeaking(true / false)   開始／停止說話（人形嘴型自動變化、貓頭鷹形態會彈跳）

// 圖片檔（放在 images/ 資料夾）
const AVATAR_FILES = {
  normal: 'images/normal.png',
  blink: 'images/blink.png',
  think: 'images/think.png',
  closed: 'images/speaking-closed.png',
  half: 'images/speaking-half.png',
  'owl-happy': 'images/owl-happy.png',
  'owl-panic': 'images/owl-panic.png',
  'owl-anxious': 'images/owl-anxious.png',
  'owl-worried': 'images/owl-worried.png'
};

// 情緒 → 畫面圖。人形：normal / think；貓頭鷹形態：情緒波動大的時候
// 想新增表情：加圖檔到 AVATAR_FILES，再在這裡加一行，chat.js 會自動認得這個標籤。
const FACE = {
  normal: 'normal',
  think: 'think',
  happy: 'owl-happy',
  panic: 'owl-panic',
  anxious: 'owl-anxious',
  worried: 'owl-worried'
};
const MOUTH_KEYS = ['closed', 'half'];
const isOwl = (key) => key.startsWith('owl-');
const BLINK_OFFSET_X = 0;
const BLINK_OFFSET_Y = 0;
let formOverride = null;
let triggerOwlMode = false;

function currentOwlForm() {
  if (triggerOwlMode) return true;
  return formOverride === null ? isOwl(FACE[avatar.emotion]) : formOverride;
}

function updateFormButton() {
  const button = document.getElementById('btnForm');
  if (!button) return;
  const owl = currentOwlForm();
  button.textContent = owl ? '🧍' : '🦉';
  button.setAttribute('aria-label', owl ? '切換成人形' : '切換成貓頭鷹');
  button.setAttribute('aria-pressed', String(owl));
}

const avatar = {
  emotion: 'normal',
  speaking: false,
  emotions: Object.keys(FACE),
  setEmotion(e) { this.emotion = FACE[e] ? e : 'normal'; updateFormButton(); },
  setSpeaking(b) { this.speaking = !!b; }
};

const imgs = {};
const layers = { cur: 'normal', prev: null, fade: 1, speed: 4 };   // 交叉淡入淡出
const motion = { tilt: 0, offX: 0, bounce: 0 };                     // 平滑後的動作
const morph = { t: 1, sparks: [] };                                  // 人形⇄貓頭鷹 變身特效
let mouthT = 0, mouthKey = 'closed';
let blinkTimer = 2.5 + Math.random() * 3, blinkPhase = null, blinkElapsed = 0;
let blinkRepeat = false, blinkSecond = false;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let speakingOwlKey = null;
let desktopMouseX = null;

function preload() {
  for (const k in AVATAR_FILES) {
    imgs[k] = loadImage(AVATAR_FILES[k], () => {}, () => console.warn('找不到圖片：' + AVATAR_FILES[k]));
  }
}

function setup() {
  const box = document.getElementById('stage');
  const c = createCanvas(box.clientWidth, box.clientHeight);
  c.parent('stage');
  pixelDensity(Math.min(2, window.devicePixelRatio || 1));
  // 畫布讀不到內容，給一段文字說明；對話內容都在右邊的 HTML 聊天區
  c.elt.setAttribute('role', 'img');
  c.elt.setAttribute('aria-label', '益迪，藍白色運動風的貓頭鷹小精靈');
}

function windowResized() {
  const box = document.getElementById('stage');
  resizeCanvas(box.clientWidth, box.clientHeight);
}

const ready = (k) => imgs[k] && imgs[k].width > 1;

// 目前該顯示哪張圖
function wantedKey() {
  if (currentOwlForm()) {
    if (avatar.speaking) return speakingOwlKey || 'owl-worried';
    const emotionKey = FACE[avatar.emotion];
    return isOwl(emotionKey) ? emotionKey : 'owl-happy';
  }
  if (avatar.speaking) return mouthKey;
  if (avatar.emotion === 'think') return 'think';
  return 'normal';
}

function startMorph() {
  if (reduceMotion) return;                       // 減少動態效果：不做變身特效
  morph.t = 0;
  morph.sparks = Array.from({ length: 16 }, () => {
    const a = Math.random() * Math.PI * 2, v = 120 + Math.random() * 220;
    return { x: 0, y: 0, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.85, size: 3 + Math.random() * 4 };
  });
}

function switchTo(key) {
  if (key === layers.cur) return;                 // 和目前一樣就不切換
  const formChanged = isOwl(key) !== isOwl(layers.cur);
  layers.prev = layers.cur;
  layers.cur = key;
  layers.fade = 0;
  if (formChanged) { layers.speed = 5; startMorph(); }
  else layers.speed = MOUTH_KEYS.includes(key) ? 14 : 4;                      // 嘴型快切、表情慢慢淡入
}

// 平滑追蹤：不管幀率，數值都會順順地靠近目標
const smooth = (cur, target, rate, dt) => lerp(cur, target, 1 - Math.exp(-rate * dt));

function draw() {
  clear();
  const dt = Math.min(deltaTime / 1000, 0.05);
  const t = millis() / 1000;

  // 說話嘴型：兩個不同頻率的 sin 疊加，閉→半→開不規則變化
  if (avatar.speaking) {
    mouthT += dt;
    const v = (Math.sin(mouthT * 13) * 0.6 + Math.sin(mouthT * 7.3 + 1.7) * 0.4 + 1) / 2;
    mouthKey = v < 0.5 ? 'closed' : 'half';
  }
  // 只在待機畫面完整穩定時眨眼，避免表情切換或變身途中閃動。
  const canBlink = !avatar.speaking && avatar.emotion === 'normal' && ready('blink') &&
    !reduceMotion && morph.t >= 1 && layers.cur === 'normal' && layers.fade >= 1;
  if (!canBlink) {
    if (blinkPhase) {
      blinkPhase = null;
      blinkElapsed = 0;
      blinkRepeat = false;
      blinkSecond = false;
      blinkTimer = 2.5 + Math.random() * 3;
    }
  } else {
    if (blinkPhase) {
      blinkElapsed += dt;
      while (blinkPhase) {
        const duration = blinkPhase === 'closing' ? 0.06 : (blinkPhase === 'hold' ? 0.04 : 0.1);
        if (blinkElapsed < duration) break;
        blinkElapsed -= duration;
        if (blinkPhase === 'closing') blinkPhase = 'hold';
        else if (blinkPhase === 'hold') blinkPhase = 'opening';
        else {
          blinkPhase = null;
          if (blinkRepeat) {
            blinkTimer = 0.14;
            blinkRepeat = false;
            blinkSecond = true;
          } else blinkTimer = 2.5 + Math.random() * 3;
        }
      }
    } else {
      blinkTimer -= dt;
      if (blinkTimer <= 0) {
        blinkPhase = 'closing';
        blinkElapsed = 0;
        if (blinkSecond) blinkSecond = false;
        else blinkRepeat = Math.random() < 0.15;
      }
    }
  }
  const blinkOpacity = blinkPhase === 'closing' ? Math.min(1, blinkElapsed / 0.06) :
    (blinkPhase === 'hold' ? 1 : (blinkPhase === 'opening' ? 1 - Math.min(1, blinkElapsed / 0.1) : 0));

  // 圖片沒載入時退回 normal，避免畫面空白
  let key = wantedKey();
  if (!ready(key) && ready('normal')) key = 'normal';
  switchTo(key);
  layers.fade = Math.min(1, layers.fade + dt * layers.speed);
  if (morph.t < 1) morph.t = Math.min(1, morph.t + dt / 0.7);

  // 動作
  const pointerX = desktopMouseX === null ? mouseX : desktopMouseX;
  const mx = constrain((pointerX - width / 2) / (width / 2), -1, 1);
  motion.tilt = smooth(motion.tilt, reduceMotion ? 0 : mx * 0.035, 6, dt);
  motion.offX = smooth(motion.offX, reduceMotion ? 0 : mx * 14, 6, dt);
  motion.bounce = smooth(motion.bounce, (!reduceMotion && avatar.speaking) ? Math.abs(Math.sin(t * 9)) * 10 : 0, 12, dt);
  const breath = reduceMotion ? 1 : 1 + 0.012 * Math.sin(t * 1.7);
  const floatY = reduceMotion ? 0 : Math.sin(t * 1.1) * 6;
  const sway = (!reduceMotion && !avatar.speaking && avatar.emotion === 'think') ? Math.sin(t * 1.5) * 0.015 : 0;
  const k = Math.sin(Math.PI * morph.t);          // 變身強度：0 → 1 → 0
  const popScale = 1 + 0.14 * k;                   // 變身時放大一下
  const wobble = Math.sin(morph.t * Math.PI * 3) * 0.05 * k;

  if (!ready('normal')) {
    fill(255); textAlign(CENTER, CENTER); textSize(16);
    text('請把角色圖片放進 images 資料夾', width / 2, height / 2);
    return;
  }

  push();
  translate(width / 2 + motion.offX, height - 6 + floatY - motion.bounce);   // 以腳底為基準
  rotate(motion.tilt + sway + wobble);
  scale(popScale);
  imageMode(CORNER);
  const boxW = width * 0.92 * breath, boxH = height * 0.95 * breath;
  const drawLayer = (name, alpha, offsetX = 0, offsetY = 0) => {
    const im = imgs[name];
    if (!ready(name) || alpha <= 0) return;
    const s = Math.min(boxW / im.width, boxH / im.height);   // 每張圖各自縮放到同一個框
    tint(255, alpha);
    image(im, -im.width * s / 2 + offsetX, -im.height * s + offsetY, im.width * s, im.height * s);
  };
  if (layers.prev && layers.fade < 1) drawLayer(layers.prev, 255);
  drawLayer(layers.cur, 255 * layers.fade);
  if (blinkOpacity > 0) drawLayer('blink', 255 * blinkOpacity, BLINK_OFFSET_X, BLINK_OFFSET_Y);
  noTint();
  pop();

  // 變身特效：中心閃光 + 星光碎片
  if (k > 0.01) {
    const cx = width / 2 + motion.offX, cy = height * 0.55, r = Math.min(width, height) * 0.5;
    const g = drawingContext.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, `rgba(255,255,255,${0.9 * k})`);
    g.addColorStop(0.4, `rgba(34,211,238,${0.5 * k})`);
    g.addColorStop(1, 'rgba(34,211,238,0)');
    drawingContext.fillStyle = g;
    drawingContext.beginPath();
    drawingContext.arc(cx, cy, r, 0, Math.PI * 2);
    drawingContext.fill();
    noStroke();
    for (const p of morph.sparks) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
      if (p.life > 0) { fill(200, 245, 255, 255 * (p.life / 0.85)); circle(cx + p.x, cy + p.y, p.size); }
    }
  }
}


// ================================================================
// ========== 以下是聊天邏輯（原 chat.js，合併在同一個檔案）==========
// ================================================================

// ========== 設定：貼上你的 Apps Script 網頁應用程式網址（/exec 結尾）==========
const API_URL = 'https://script.google.com/macros/s/AKfycbwITBz55IGbrRFo2jceFmGdbS2v-pstQteGqGistvRNKqkFMXmt9r-fHVxFe-F5C255/exec';

// ========== 設定 ==========
// 連線失敗或出錯時使用的情緒（原本規格是 think；現在改用貓頭鷹的憂慮表情）
const ERROR_EMOTION = 'anxious';
// 可用的情緒標籤由 sketch.js 的 FACE 決定（avatar.emotions），新增表情不需要改這裡

// ========== 關鍵字清單（只定義一次）：順序就是優先順序 ==========
const EMOTION_KEYWORDS = [
  { emotion: 'happy', words: ['開心', '喜歡', '哈哈', '耶', '棒', '歡迎', '😊', '✨'] },
  { emotion: 'panic', words: ['糟糕', '糟了', '天啊', '😱'] },
  { emotion: 'anxious', words: ['抱歉', '對不起', '😰'] },
  { emotion: 'worried', words: ['擔心', '😟'] },
  { emotion: 'think', words: ['嗯', '想想', '可能', '或許', '好像', '不確定', '不知道', '🤔'] }
];

const QUICK = ['保證金要繳多少？', '怎麼報名？', '比賽時間地點？', '羽球賽制是什麼？', '附近有什麼吃的？'];

// 判斷情緒：先讀回覆開頭的 [標籤]，沒有才用關鍵字；都沒有就是 normal
function detectEmotion(text) {
  const m = text.match(/^\s*\[(\w+)\]/);
  if (m && avatar.emotions.includes(m[1].toLowerCase())) return m[1].toLowerCase();
  const body = stripTag(text);
  for (const g of EMOTION_KEYWORDS) if (g.words.some((w) => body.includes(w))) return g.emotion;
  return 'normal';
}
// 移除開頭標籤（顯示與朗讀都用移除後的文字）
function stripTag(text) { return text.replace(/^\s*\[\w+\]\s*/, ''); }

// ---------- 元素與狀態 ----------
const $ = (id) => document.getElementById(id);
const log = $('log'), statusEl = $('status'), input = $('input');
const voiceSelect = $('voiceSelect'), voiceRate = $('voiceRate'), voicePitch = $('voicePitch');
const rateValue = $('rateValue'), pitchValue = $('pitchValue');
const backgroundMusic = $('backgroundMusic'), btnMusic = $('btnMusic');
const musicVolume = $('musicVolume'), musicVolumeValue = $('musicVolumeValue');
const musicNotice = $('musicNotice');
const IDLE_STATUS = '全育盃小幫手・線上';
let ttsOn = false, busy = false, speakTimer = null, revertTimer = null, speechGeneration = 0;
let availableVoices = [], activeReplayButton = null;
let musicEnabled = false;

function setStatus(t) { statusEl.textContent = t; }
function setReplayButtonState(button, playing) {
  button.textContent = playing ? '⏹' : '🔊';
  button.title = playing ? '停止播放語音' : '重新播放語音';
  button.setAttribute('aria-label', playing ? '停止播放這則訊息' : '重新播放這則訊息');
  button.setAttribute('aria-pressed', String(playing));
}
function refreshVoices() {
  const selected = availableVoices[Number(voiceSelect.value)];
  const selectedURI = selected ? selected.voiceURI : '';
  availableVoices = speechSynthesis.getVoices();
  voiceSelect.replaceChildren();
  if (!availableVoices.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = '沒有可用的語音';
    voiceSelect.appendChild(option);
    voiceSelect.disabled = true;
    return;
  }

  voiceSelect.disabled = false;
  availableVoices.forEach((voice, index) => {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = `${voice.name} (${voice.lang})`;
    voiceSelect.appendChild(option);
  });

  let selectedIndex = selectedURI ? availableVoices.findIndex((voice) => voice.voiceURI === selectedURI) : -1;
  if (selectedIndex < 0) selectedIndex = availableVoices.findIndex((voice) => (voice.lang || '').toLowerCase() === 'zh-tw');
  if (selectedIndex < 0) selectedIndex = availableVoices.findIndex((voice) => (voice.lang || '').toLowerCase().startsWith('zh'));
  voiceSelect.value = String(selectedIndex < 0 ? 0 : selectedIndex);
}
function updateVoiceValues() {
  rateValue.textContent = `${Number(voiceRate.value).toFixed(1)}×`;
  pitchValue.textContent = Number(voicePitch.value).toFixed(1);
}
function updateMusicVolume() {
  const volume = Number(musicVolume.value);
  backgroundMusic.volume = volume;
  musicVolumeValue.textContent = `${Math.round(volume * 100)}%`;
}
function setMusicButton(playing) {
  btnMusic.setAttribute('aria-pressed', String(playing));
  btnMusic.textContent = `🎵 背景音樂：${playing ? '開' : '關'}`;
}
function reportMusicError(error) {
  if (!musicEnabled) return;
  console.error('背景音樂播放失敗：', error);
  musicEnabled = false;
  backgroundMusic.pause();
  setMusicButton(false);
  musicNotice.textContent = '背景音樂無法播放，請確認 music.mp3 檔案存在且格式可播放。';
  musicNotice.hidden = false;
  setStatus('背景音樂播放失敗，請檢查 music.mp3。');
}
function setMusicEnabled(enabled) {
  if (!enabled) {
    musicEnabled = false;
    backgroundMusic.pause();
    setMusicButton(false);
    return;
  }
  if (musicEnabled) return;

  musicEnabled = true;
  musicNotice.hidden = true;
  updateMusicVolume();
  setMusicButton(true);
  const playback = backgroundMusic.play();
  if (playback && typeof playback.catch === 'function') playback.catch(reportMusicError);
}
function addMsg(text, who, replayable = false) {
  const d = document.createElement('div');
  d.className = 'msg ' + who;
  d.textContent = text;
  if (who === 'bot' && replayable && 'speechSynthesis' in window) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'msg-audio';
    setReplayButtonState(button, false);
    button.addEventListener('click', () => {
      if (activeReplayButton === button) {
        stopSpeaking();
        setStatus(busy ? '思考中…' : IDLE_STATUS);
        return;
      }
      stopSpeaking();
      activeReplayButton = button;
      setReplayButtonState(button, true);
      speak(text, true, () => {
        if (activeReplayButton === button) {
          activeReplayButton = null;
          setReplayButtonState(button, false);
        }
      });
    });
    d.appendChild(button);
  }
  log.appendChild(d);
  log.scrollTop = log.scrollHeight;
  return d;
}

function cancelRevert() {
  clearTimeout(revertTimer);
  revertTimer = null;
}

function scheduleRevert() {
  cancelRevert();
  const delay = avatar.emotion === 'think' ? 4000 : (isOwl(FACE[avatar.emotion]) ? 3500 : 0);
  if (!delay) return;
  revertTimer = setTimeout(() => {
    revertTimer = null;
    triggerOwlMode = false;
    avatar.setEmotion('normal');
  }, delay);
}

// ---------- 說話：嘴型由 sketch.js 自動變化；有語音就播完才停，沒語音就依字數估時間 ----------
function stopSpeaking() {
  speechGeneration++;
  clearTimeout(speakTimer);
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  avatar.setSpeaking(false);
  speakingOwlKey = null;
  if (activeReplayButton) {
    setReplayButtonState(activeReplayButton, false);
    activeReplayButton = null;
  }
}
function speak(text, forceTts = false, onFinish = null, preserveOwlEmotion = false) {
  cancelRevert();
  const generation = ++speechGeneration;
  let finished = false;
  const emotionKey = FACE[avatar.emotion];
  speakingOwlKey = preserveOwlEmotion && isOwl(emotionKey) ? emotionKey : null;
  const finish = () => {
    if (finished || generation !== speechGeneration) return;
    finished = true;
    const owlReply = currentOwlForm();
    avatar.setSpeaking(false);
    speakingOwlKey = null;
    if (owlReply && !preserveOwlEmotion) avatar.setEmotion('happy');
    setStatus(IDLE_STATUS);
    scheduleRevert();
    if (onFinish) onFinish();
  };
  avatar.setSpeaking(true);
  setStatus('益迪回答中…');
  if ((ttsOn || forceTts) && 'speechSynthesis' in window) {
    const u = new SpeechSynthesisUtterance(text);
    const selectedVoice = availableVoices[Number(voiceSelect.value)];
    u.lang = selectedVoice ? (selectedVoice.lang || 'zh-TW') : 'zh-TW';
    if (selectedVoice) u.voice = selectedVoice;
    u.rate = Number(voiceRate.value);
    u.pitch = Number(voicePitch.value);
    u.onend = u.onerror = finish;
    speechSynthesis.speak(u);
  } else {
    speakTimer = setTimeout(finish, Math.min(6000, 700 + text.length * 55));
  }
}

// ---------- 送出問題 ----------
async function send(text) {
  text = text.trim();
  if (!text || busy) return;
  const mentionsOwl = text.includes('貓頭鷹');
  const insultedAvatar = text.includes('你好笨') || text.includes('笨');
  const preserveOwlEmotion = mentionsOwl || insultedAvatar;
  triggerOwlMode = preserveOwlEmotion;
  updateFormButton();
  cancelRevert();
  busy = true; $('btnSend').disabled = true;
  addMsg(text, 'user'); input.value = '';
  stopSpeaking();

  avatar.setEmotion('think');                     // 送出後立刻換思考表情
  const thinking = addMsg('思考中…', 'bot');
  thinking.classList.add('thinking');
  setStatus('思考中…');

  let raw, emotion;
  try {
    if (mentionsOwl) {
      raw = '怎麼被發現的!';
      emotion = 'panic';
    } else {
      // 用 text/plain 送 JSON，可避開跨網域預檢問題
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ message: text })
      });
      const data = await res.json();
      raw = data.reply;
      if (!raw) throw new Error('empty');
      emotion = insultedAvatar ? 'anxious' : detectEmotion(raw);
    }
  } catch (e) {
    raw = '連線好像出了點問題，請稍後再試一次。';
    emotion = ERROR_EMOTION;                      // 錯誤時用 ERROR_EMOTION（預設 anxious）
  }

  const clean = stripTag(raw);
  thinking.remove();
  addMsg(clean, 'bot', true);
  cancelRevert();
  avatar.setEmotion(emotion);                     // 說完後會停在這個表情
  speak(clean, false, null, preserveOwlEmotion);
  busy = false; $('btnSend').disabled = false; input.focus();
}

// ---------- 事件綁定 ----------
const coverMenu = $('coverMenu'), coverMenuToggle = $('coverMenuToggle');
const desktopPetHelp = $('desktopPetHelp');
function closeCoverMenu() {
  coverMenu.hidden = true;
  coverMenuToggle.setAttribute('aria-expanded', 'false');
  coverMenuToggle.setAttribute('aria-label', '開啟封面選單');
}
coverMenuToggle.addEventListener('click', () => {
  const open = coverMenu.hidden;
  coverMenu.hidden = !open;
  coverMenuToggle.setAttribute('aria-expanded', String(open));
  coverMenuToggle.setAttribute('aria-label', open ? '關閉封面選單' : '開啟封面選單');
});
$('btnDesktopPetHelp').addEventListener('click', () => {
  closeCoverMenu();
  desktopPetHelp.showModal();
});
$('btnCloseDesktopPetHelp').addEventListener('click', () => desktopPetHelp.close());
document.addEventListener('click', (e) => {
  if (!coverMenu.hidden && !coverMenu.contains(e.target) && !coverMenuToggle.contains(e.target)) closeCoverMenu();
});
$('enterChat').addEventListener('click', () => {
  closeCoverMenu();
  $('cover').hidden = true;
  document.body.classList.remove('intro');
  $('app').setAttribute('aria-hidden', 'false');
  $('skipLink').href = '#input';
  $('skipLink').textContent = '跳到輸入框';
  setMusicEnabled(true);
  input.focus();
});
$('btnBackCover').addEventListener('click', () => {
  $('menu').hidden = true;
  $('btnMenu').setAttribute('aria-expanded', 'false');
  $('cover').hidden = false;
  document.body.classList.add('intro');
  $('app').setAttribute('aria-hidden', 'true');
  $('skipLink').href = '#enterChat';
  $('skipLink').textContent = '跳到進入聊天';
  $('enterChat').focus();
});
$('btnForm').addEventListener('click', () => {
  const owl = currentOwlForm();
  triggerOwlMode = false;
  formOverride = !owl;
  updateFormButton();
});
$('voiceRate').addEventListener('input', updateVoiceValues);
$('voicePitch').addEventListener('input', updateVoiceValues);
updateVoiceValues();
if ('speechSynthesis' in window) {
  speechSynthesis.onvoiceschanged = refreshVoices;
  refreshVoices();
} else {
  voiceSelect.replaceChildren(new Option('此瀏覽器不支援語音', ''));
  voiceSelect.disabled = true;
}
$('form').addEventListener('submit', (e) => { e.preventDefault(); send(input.value); });
QUICK.forEach((q) => {
  const b = document.createElement('button');
  b.type = 'button'; b.textContent = q;
  b.addEventListener('click', () => send(q));
  $('quick').appendChild(b);
});

$('btnMenu').addEventListener('click', (e) => {
  const open = $('menu').hidden;
  $('menu').hidden = !open;
  e.currentTarget.setAttribute('aria-expanded', open);
});
$('btnFont').addEventListener('click', (e) => {
  e.currentTarget.setAttribute('aria-pressed', document.body.classList.toggle('big'));
});
$('btnContrast').addEventListener('click', (e) => {
  e.currentTarget.setAttribute('aria-pressed', document.body.classList.toggle('contrast'));
});
$('btnTts').addEventListener('click', (e) => {
  ttsOn = !ttsOn;
  if (!ttsOn) stopSpeaking();
  e.currentTarget.setAttribute('aria-pressed', ttsOn);
  e.currentTarget.textContent = '🔈 語音朗讀：' + (ttsOn ? '開' : '關');
});
$('btnMusic').addEventListener('click', () => setMusicEnabled(!musicEnabled));
$('musicVolume').addEventListener('input', updateMusicVolume);
backgroundMusic.addEventListener('error', () => reportMusicError(backgroundMusic.error));
updateMusicVolume();

// ---------- 語音輸入（Chrome / Edge / Safari）----------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const mic = $('btnMic');
if (!SR) {
  mic.disabled = true;
  mic.title = '此瀏覽器不支援語音輸入，請改用文字輸入';
  mic.setAttribute('aria-label', '語音輸入（此瀏覽器不支援）');
} else {
  const rec = new SR();
  rec.lang = 'zh-TW'; rec.interimResults = false;
  let listening = false;
  mic.addEventListener('click', () => {
    cancelRevert();
    if (listening) rec.stop();
    else { stopSpeaking(); try { rec.start(); } catch (e) {} }
  });
  rec.onstart = () => { cancelRevert(); triggerOwlMode = false; listening = true; mic.setAttribute('aria-pressed', 'true'); avatar.setEmotion('normal'); setStatus('我在聽，請說…'); };
  rec.onresult = (e) => send(e.results[0][0].transcript);
  rec.onerror = () => setStatus('沒聽清楚，可以再試一次或改用打字。');
  rec.onend = () => { listening = false; mic.setAttribute('aria-pressed', 'false'); if (!busy) setStatus(IDLE_STATUS); };
}

// ---------- 鍵盤快捷鍵 ----------
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (desktopPetHelp.open) {
      desktopPetHelp.close();
      return;
    }
    closeCoverMenu();
    if (!document.body.classList.contains('intro')) {
      $('menu').hidden = true;
      $('btnMenu').setAttribute('aria-expanded', 'false');
    }
    return;
  }
  if (document.body.classList.contains('intro')) return;
  const typing = document.activeElement === input;
  if (e.key === '/' && !typing) { e.preventDefault(); input.focus(); }
  else if ((e.key === 'm' || e.key === 'M') && !typing && !mic.disabled) mic.click();
});

addMsg('嗨，我是益迪！報名、保證金、賽制、賽程、周邊資訊都可以問我喔。', 'bot', true);
updateFormButton();

function applyDesktopPetMode(enabled) {
  document.body.classList.toggle('pet-mode', enabled);
  if (!enabled) desktopMouseX = null;
  $('btnPetMode').textContent = enabled ? '💬 返回聊天模式' : '🐾 啟動桌寵模式';
  $('btnPetMode').setAttribute('aria-pressed', String(enabled));
  $('petDragHandle').hidden = !enabled;
  $('btnPetExit').hidden = !enabled;
  $('btnPetClose').hidden = !enabled;
  if (enabled) {
    $('menu').hidden = true;
    $('btnMenu').setAttribute('aria-expanded', 'false');
  }
}

async function toggleDesktopPetMode() {
  try {
    applyDesktopPetMode(await window.desktopPet.toggleMode());
  } catch (error) {
    console.error('無法切換桌寵模式：', error);
    setStatus('桌寵模式切換失敗，請重試。');
  }
}

if (window.desktopPet) {
  document.body.classList.add('electron-app');
  $('btnPetMode').disabled = false;
  $('btnPetMode').textContent = '🐾 啟動桌寵模式';
  $('desktopWindowControls').hidden = false;
  $('coverWindowControls').hidden = false;
  window.desktopPet.onModeChanged(applyDesktopPetMode);
  window.desktopPet.onCursorMoved((x) => {
    desktopMouseX = Number.isFinite(x) ? x : null;
  });
  $('btnPetMode').addEventListener('click', toggleDesktopPetMode);
  $('btnPetExit').addEventListener('click', toggleDesktopPetMode);
  $('btnCoverMinimize').addEventListener('click', () => window.desktopPet.minimize());
  $('btnCoverClose').addEventListener('click', () => window.desktopPet.close());
  $('btnMinimize').addEventListener('click', () => window.desktopPet.minimize());
  $('btnWindowClose').addEventListener('click', () => window.desktopPet.close());
  $('btnPetClose').addEventListener('click', () => window.desktopPet.close());
} else {
  $('desktopPetNote').hidden = false;
}
