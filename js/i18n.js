/*
 * GRAVEWAVE — Arabic / English.
 *
 * The game code writes its text in English. When Arabic is on, every piece of text that appears
 * on screen is translated on its way in: a watcher on the page catches each text change (HUD,
 * banners, prompts, menus) and swaps in the Arabic, and canvas labels go through GW.L.t().
 * Weapon names stay as they are, like brand names.
 */
(function () {
  'use strict';
  const GW = (window.GW = window.GW || {});
  const KEY = 'gravewave.lang';

  // English -> Arabic. Whole phrases and the fragments that prompts are built from.
  const AR = {
    // ---- places ----
    'LAST NIGHT AT LUMINA PIER': 'الليلة الأخيرة في رصيف لومينا',
    'Last Night at Lumina Pier': 'الليلة الأخيرة في رصيف لومينا',
    'LUMINA PIER': 'رصيف لومينا',
    'Boardwalk Plaza': 'ساحة الممشى',
    'Pixel Palace': 'قصر البكسل',
    'Deep Six Aquarium': 'أكواريوم الأعماق',
    'Burnout Speedway': 'حلبة السرعة',
    'The Substation': 'محطة الكهرباء',
    'Substation': 'محطة الكهرباء',
    'Overclock Stage': 'مسرح التطوير',
    'Starwheel Plaza': 'ساحة عجلة النجوم',
    'Nightmare Manor': 'قصر الكوابيس',
    'Pier Nine Docks': 'رصيف الميناء 9',
    PLAZA: 'الساحة', ARCADE: 'صالة الألعاب', AQUARIUM: 'الأكواريوم', SPEEDWAY: 'الحلبة', SUBSTATION: 'المحطة',
    STAGE: 'المسرح', STARWHEEL: 'عجلة النجوم', MANOR: 'القصر', PIER: 'الرصيف',
    ' POWERED': ' اشتغلت',
    ' generators online': ' مولدات شغالة',
    'Overclock Stage unlocked': 'انفتح مسرح التطوير',

    // ---- perks, power-ups, gadgets, mods, traps ----
    'Thick Skin': 'جلد سميك', 'Quick Hands': 'أيدي سريعة', Afterburner: 'الدفع النفاث', 'Twin Trigger': 'الزناد المزدوج', 'Second Wind': 'النفَس الثاني',
    'Max health 100 → 250': 'الصحة القصوى من 100 إلى 250', 'Reload twice as fast': 'تعبئة أسرع مرتين', 'Move faster, sprint longer': 'حركة أسرع وركض أطول',
    '+33% rate of fire': 'إطلاق أسرع 33%', 'Cheat death once': 'تنجو من الموت مرة وحدة',
    'FULL RELOAD': 'ذخيرة كاملة', 'All reserves refilled': 'تعبّت كل الذخيرة',
    OVERKILL: 'ضربة قاضية', 'Everything dies in one hit': 'كل شي يموت من ضربة وحدة',
    'DOUBLE SCORE': 'نقاط مضاعفة', 'All points x2': 'كل النقاط ×2',
    PURGE: 'تطهير', 'The horde is vaporised': 'تبخّر الزومبي',
    'BOARD UP': 'تحصين', 'All barricades rebuilt': 'انبنت كل الحواجز',
    'PIXEL PAL': 'صديق البكسل', 'Pixel Pal': 'صديق البكسل', 'A robot buddy joins the fight': 'روبوت صديق ينضم للقتال',
    'Cryo Grenade': 'قنبلة تجميد', 'Neon Lure': 'طُعم النيون', 'Safety Bubble': 'فقاعة الأمان',
    'Freezes, then slows the horde': 'تجمّد الزومبي ثم تبطّئهم', 'Draws zombies in, then detonates': 'تجذب الزومبي ثم تنفجر', 'A dome zombies cannot enter': 'قبة ما يقدر يدخلها الزومبي',
    'Inferno rounds': 'ذخيرة الجحيم', 'Arc rounds': 'ذخيرة الصعق', 'Frost rounds': 'ذخيرة الصقيع', 'Blast rounds': 'ذخيرة التفجير',
    INFERNO: 'جحيم', Inferno: 'جحيم', Arc: 'صعق', ARC: 'صعق', Frost: 'صقيع', FROST: 'صقيع', Blast: 'تفجير', BLAST: 'تفجير',
    'burns a share of max health': 'يحرق جزء من صحته', 'chains to nearby zombies': 'ينتقل للزومبي القريبين', 'slows, then freezes': 'يبطّئ ثم يجمّد', 'small explosions': 'انفجارات صغيرة',
    'Zapper Floor': 'أرضية الصعق', 'Burnout Jets': 'نفاثات اللهب', 'Laser Grid': 'شبكة الليزر',
    'Plate Armor': 'الدرع', 'HOVER SENTRY': 'البرج الطائر', 'Hover Sentry': 'البرج الطائر', SENTRY: 'البرج', LOCKDOWN: 'إغلاق', Lockdown: 'الإغلاق',
    'Prize Crate': 'صندوق الجوائز', OVERCLOCKER: 'المطوّر', Overclocker: 'المطوّر', LOCKED: 'مقفل',

    // ---- prompts ----
    'Press ': 'اضغط ', 'Hold ': 'اضغط مطوّل ',
    ' to open the way to ': ' لفتح الطريق إلى ',
    'Sealed — restore the power': 'مقفل — رجّع الكهرباء',
    ' to buy a Hover Sentry ': ' لشراء برج طائر ',
    ' to buy ': ' لشراء ',
    ' — ammo full': ' — الذخيرة كاملة',
    ' ammo ': ' ذخيرة ',
    ' to insert a fuse and power ': ' لتركيب فيوز وتشغيل ',
    'opens the Overclock Stage': 'يفتح مسرح التطوير',
    ' generator — needs a fuse': ' — المولد يحتاج فيوز',
    ' — no power in ': ' — ما فيه كهرباء في ',
    ' — already active': ' — مفعّل عندك',
    ' — sold out': ' — خلص',
    'The Prize Crate has moved on': 'صندوق الجوائز انتقل لمكان ثاني',
    ' to spin the Prize Crate ': ' لتدوير صندوق الجوائز ',
    ' to take ': ' لأخذ ',
    'Overclocker — no power on the stage': 'المطوّر — ما فيه كهرباء في المسرح',
    'No weapon to overclock': 'ما عندك سلاح تطوّره',
    ' is fully overclocked': ' مطوّر بالكامل',
    ' to overclock ': ' لتطوير ',
    ' to tier ': ' للمستوى ',
    ' to rebuild the barricade': ' لبناء الحاجز',
    ' to pick up a fuse': ' لأخذ الفيوز',
    ' — running ': ' — شغال ',
    ' — recharging ': ' — يشحن ',
    ' to activate the ': ' لتشغيل ',
    ' to escape through the maintenance hatch': ' للهروب من فتحة الصيانة',
    'Panic room — recharging ': 'غرفة الطوارئ — تشحن ',
    ' to seal the panic room ': ' لقفل غرفة الطوارئ ',
    'Teleporter — needs power here and in ': 'الناقل — يحتاج كهرباء هنا وفي ',
    'Teleporter — open ': 'الناقل — افتح ',
    'Teleporter — recharging ': 'الناقل — يشحن ',
    ' first': ' أول',
    ' to teleport to ': ' للانتقال إلى ',
    'Plate Armor — fully repaired': 'الدرع — مصلّح بالكامل',
    'absorbs 70% of damage': 'يمتص 70% من الضرر',
    ' — fully stocked': ' — مليان',
    'replaces ': 'بدل ',
    'Pixel Pal — already deployed': 'صديق البكسل — موجود',
    ' to summon a Pixel Pal ': ' لاستدعاء صديق البكسل ',
    ' — press ': ' — اضغط ',
    ' to deploy the one you carry': ' لتنزيل اللي معك',
    'deploy with X': 'نزّله بزر X',
    ' for ': ' لشراء ',
    ' with ': ' مع ',

    // ---- banners ----
    "YOU'RE DOWN": 'طحت!', 'Back next round if your team survives': 'ترجع الجولة الجاية إذا فريقك صمد',
    'BACK IN THE FIGHT': 'رجعت للقتال', 'Your perks were lost': 'راحت مميزاتك',
    'BOSS ROUND': 'جولة الزعيم', 'The Headliner takes the stage': 'النجم طلع على المسرح',
    BREAKOUT: 'انطلق!', 'Shockwave released — move!': 'موجة صدمة — تحرّك!',
    'You are ': 'أنت ', ' — stick together': ' — خلّكم مع بعض',
    ESCAPED: 'هربت', 'Out through the maintenance tunnel': 'طلعت من نفق الصيانة',
    'FUSE FOUND': 'لقيت فيوز', 'Insert it into any zone generator': 'ركّبه في أي مولد',
    'HEADLINER DOWN': 'سقط النجم', ' points': ' نقطة', 'free perk: ': 'ميزة مجانية: ',
    'Press X to deploy': 'اضغط X لتنزيله',
    'LIGHTS OUT': 'انطفت الأنوار', 'Shriekers are loose on the pier': 'الصرّاخين منتشرين في الرصيف',
    'Panic room sealed for ': 'غرفة الطوارئ مقفلة لمدة ', ' seconds': ' ثانية',
    'The park is closed. Something is still inside.': 'الحديقة مقفلة… بس فيه شي لسّا جوّا.',
    'PRIZE CRATE RELOCATED': 'صندوق الجوائز انتقل', 'Look for the beam over ': 'دوّر على الشعاع فوق ',
    'ROUND ': 'الجولة ', 'Something big is coming': 'فيه شي كبير جاي',
    'SECOND WIND': 'النفَس الثاني', 'All perks lost — keep moving': 'راحت كل المميزات — لا توقف',
    'SHUTTER OPENING': 'الباب ينفتح', 'Get ready': 'استعد',
    'THE HEADLINER': 'النجم', 'Hit the glowing core on its back': 'اضرب النواة المضيئة اللي في ظهره',
    'THE JESTER LAUGHS': 'المهرّج يضحك', 'Points refunded — the Prize Crate is moving': 'رجعت نقاطك — صندوق الجوائز بينتقل',
    ' LEFT': ' طلع', 'Picked up by ': 'أخذه ', 'a teammate': 'زميلك',
    'MUSIC ON': 'الموسيقى شغالة', 'MUSIC OFF': 'الموسيقى طافية',
    FINALE: 'الختام', 'SECOND ACT': 'الفصل الثاني', 'The Headliner is enraged': 'النجم معصّب', 'It calls for backup': 'ينادي على المساعدة',
    ' IS DOWN': ' طاح', 'Survive the round to bring them back': 'اصمدوا لين تخلص الجولة عشان يرجع',
    'CO-OP': 'لعب جماعي',

    // ---- objective ----
    'Insert your fuse into a zone generator (': 'ركّب الفيوز في أي مولد (',
    ' online)': ' شغالة)',
    'Earn points, open the park and search for fuses': 'اجمع نقاط، افتح الحديقة ودوّر على فيوزات',
    'Search the park for a fuse and power a generator': 'دوّر على فيوز وشغّل مولد',
    'Power the Substation to unlock the Overclock Stage (': 'شغّل محطة الكهرباء عشان ينفتح مسرح التطوير (',
    'Overclock a weapon on the Overclock Stage': 'طوّر سلاح في مسرح التطوير',
    'Restore the park: ': 'شغّل الحديقة: ',
    Survive: 'اصمد',

    // ---- HUD ----
    'POWER ': 'الكهرباء ', 'FUSES ': 'فيوزات ', RELOADING: 'يعبّي…', 'PRESS R TO RELOAD': 'اضغط R للتعبئة', 'LAST MAGAZINE': 'آخر مخزن',
    'KNIFE ONLY': 'سكين بس', 'STUNNED — HIT THE CORE ON ITS BACK': 'مصعوق — اضرب النواة في ظهره',
    'ACT I — ARMOURED FRONT, WEAK BACK': 'الفصل الأول — قدّامه مدرّع وظهره ضعيف', 'ACT II': 'الفصل الثاني',
    MAP: 'الخريطة', REGEN: 'تعافي', HP: 'صحة', RUN: 'ركض', ARM: 'درع',
    PING: 'البنق', DOWN: 'طايح', 'SPECTATING — back next round': 'تتفرج — ترجع الجولة الجاية',

    // ---- title, menus, touch ----
    'START SHIFT': 'ابدأ المناوبة', 'FULL SCREEN': 'شاشة كاملة',
    'Left thumb: move (push to the edge to sprint) · Right thumb: aim and shoot · USE appears when you can buy something':
      'الإبهام اليسار: حركة (ادفعه للطرف عشان تركض) · الإبهام اليمين: صوّب واطلق · زر «استخدم» يطلع لما تقدر تشتري شي',
    'Earn points. Open the park. Restore the power. Overclock everything. Don\'t die.': 'اجمع نقاط. افتح الحديقة. رجّع الكهرباء. طوّر كل شي. لا تموت.',
    'Turn your phone sideways to play': 'لف جوالك بالعرض عشان تلعب',
    'Best run: round ': 'أفضل محاولة: الجولة ',
    'buy / interact': 'شراء / تفاعل', 'swap weapon': 'تبديل السلاح', 'deploy sentry': 'تنزيل البرج', 'music on/off': 'تشغيل/إيقاف الموسيقى',
    move: 'حركة', aim: 'تصويب', fire: 'إطلاق', sprint: 'ركض', reload: 'تعبئة', knife: 'سكين', grenade: 'قنبلة', tactical: 'قنبلة خاصة',
    pause: 'إيقاف', swap: 'تبديل', music: 'موسيقى', MOUSE: 'الماوس', WHEEL: 'العجلة',
    PAUSED: 'إيقاف مؤقت', MUSIC: 'الموسيقى', SFX: 'المؤثرات', 'SHOW FPS': 'عرض FPS', RESUME: 'كمّل', RESTART: 'من جديد', 'LEAVE GAME': 'اطلع من اللعبة',
    'GAME OVER': 'انتهت اللعبة', 'PLAY AGAIN': 'العب مرة ثانية', 'BACK TO ROOM': 'رجوع للغرفة',
    'You reached round ': 'وصلت الجولة ', ' — new best!': ' — رقم قياسي جديد!', ' · survived ': ' · صمدت ',
    Kills: 'القتلى', 'Critical kills': 'ضربات قاتلة', Accuracy: 'الدقة', 'Points earned': 'النقاط', 'Doors opened': 'الأبواب المفتوحة',
    'Second Winds used': 'مرات النفَس الثاني', 'Time survived': 'مدة الصمود',
    USE: 'استخدم', RELOAD: 'تعبئة', SWAP: 'تبديل', NADE: 'قنبلة', TAC: 'خاصة', KNIFE: 'سكين',
    'NEEDS POWER': 'يحتاج كهرباء', 'CHOOSE AN AMMO MOD': 'اختر نوع الذخيرة', 'Your weapon is overclocked. Pick what its rounds do.': 'سلاحك تطوّر. اختر وش تسوي ذخيرته.',
    LATER: 'بعدين', ' is spinning the Prize Crate': ' يفتح صندوق الجوائز', ' and choose its ammo mod': ' واختر نوع الذخيرة',
        DASH: 'زحلقة', 'FIRE: DRAG TO SHOOT': 'الإطلاق: اسحب العصا', 'FIRE: TAP TO SHOOT': 'الإطلاق: بمجرد اللمس',
    'MAP · TAB': 'الخريطة', slide: 'زحلقة', 'big map': 'الخريطة الكبيرة',
    'Left thumb: move (push past the ring to sprint) · Right thumb: aim and shoot · DASH slides · Tap the map to enlarge it':
      'الإبهام اليسار: حركة (اطلع برا الدائرة عشان تركض) · الإبهام اليمين: صوّب واطلق · زر «زحلقة» للانزلاق · المس الخريطة عشان تكبر',

    // ---- co-op lobby ----
    'Up to 4 players against the horde': 'لين 4 لاعبين ضد الزومبي',
    'CREATE ROOM': 'أنشئ غرفة', JOIN: 'انضم', 'ROOM CODE': 'كود الغرفة', 'START GAME': 'ابدأ اللعبة', BACK: 'رجوع',
    ' (YOU)': ' (أنت)', 'Waiting for ': 'بانتظار ', ' to start…': ' يبدأ اللعبة…',
    'Tell your friends this code': 'أعط أصحابك هالكود', 'Ready when you are': 'جاهزين متى ما بغيت',
    'Connecting…': 'جاري الاتصال…', 'Could not connect to the game server': 'ما قدرنا نتصل بسيرفر اللعبة',
    'Connection lost — the game ended': 'انقطع الاتصال — انتهت اللعبة', 'Connection lost': 'انقطع الاتصال',
    'Enter the 4-letter code': 'اكتب الكود (4 حروف)',
    'No game with code ': 'ما فيه لعبة بالكود ', 'That game is full (4 players)': 'اللعبة مليانة (4 لاعبين)',
    'That game has already started': 'اللعبة بدأت خلاص', 'Server is full, try again later': 'السيرفر مليان، جرّب بعدين',
    'Server error, try again': 'صار خطأ في السيرفر، جرّب مرة ثانية',
    'ONLINE · FROM ANYWHERE': 'أونلاين · من أي مكان', 'HOME · SAME WI-FI': 'محلي · نفس الواي فاي', GO: 'اتصل',
    'Play together from anywhere, over the internet': 'العبوا مع بعض من أي مكان عن طريق الإنترنت',
    'Opening the online server…': 'جاري فتح سيرفر الأونلاين…',
    'Home server: ': 'السيرفر المحلي: ', 'everyone must be on this Wi-Fi': 'لازم الكل يكون على نفس الواي فاي',
    'Start the play-at-home file on a computer on this Wi-Fi, then type the address it shows':
      'شغّل ملف اللعب بالبيت على كمبيوتر متصل بنفس الواي فاي، واكتب هنا العنوان اللي يطلع لك',
    'Type the address shown on the computer, like 192.168.1.5': 'اكتب العنوان اللي طالع على الكمبيوتر، مثل 192.168.1.5',
  };

  // weapon names stay in English (like brand names): listed so their words are never half-translated
  function protectWeapons() {
    for (const id in GW.WEAPONS || {}) {
      const d = GW.WEAPONS[id];
      for (const n of [d.name, d.up && d.up.name]) if (n && !(n in AR)) AR[n] = n;
    }
  }

  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let re = null;
  function build() {
    protectWeapons();
    const keys = Object.keys(AR).sort((a, b) => b.length - a.length);
    // whole words only: a phrase that starts or ends with a letter must not touch another letter there
    const pat = (k) => (/^[A-Za-z]/.test(k) ? '(?<![A-Za-z])' : '') + esc(k) + (/[A-Za-z]$/.test(k) ? '(?![A-Za-z])' : '');
    re = new RegExp(keys.map(pat).join('|'), 'g');
  }

  const cache = new Map();
  const L = (GW.L = { lang: 'en' });

  /** Translate one piece of on-screen text into the current language. */
  L.t = function (s) {
    if (L.lang !== 'ar' || !s || typeof s !== 'string' || !/[A-Za-z]/.test(s)) return s;
    let out = cache.get(s);
    if (out !== undefined) return out;
    if (!re) build();
    out = s
      .replace(/(\d+)s left/g, 'باقي $1 ث')
      .replace(/(\d+)s(?![A-Za-z])/g, '$1 ث')
      .replace(re, (m) => AR[m]);
    if (cache.size > 4000) cache.clear();
    cache.set(s, out);
    return out;
  };

  /* ---- live translation of the page ---- */
  const orig = new WeakMap(); // text node -> its English
  const mine = new WeakMap(); // text node -> what we last wrote into it

  function fixNode(node) {
    const cur = node.data;
    if (mine.get(node) === cur) return; // our own translation
    orig.set(node, cur);
    const out = L.t(cur);
    if (out !== cur) {
      mine.set(node, out);
      node.data = out;
    } else mine.delete(node);
  }

  function walk(root) {
    if (root.nodeType === 3) return fixNode(root);
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = tw.nextNode(); n; n = tw.nextNode()) fixNode(n);
  }

  /** Re-translate everything after the language changed. */
  function retranslate(root) {
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = tw.nextNode(); n; n = tw.nextNode()) {
      if (orig.has(n) && mine.get(n) === n.data) n.data = orig.get(n); // back to English first
      mine.delete(n);
      fixNode(n);
    }
  }

  L.set = function (lang) {
    L.lang = lang === 'ar' ? 'ar' : 'en';
    cache.clear();
    try {
      localStorage.setItem(KEY, L.lang);
    } catch (e) {
      /* storage unavailable */
    }
    const root = document.documentElement;
    root.lang = L.lang;
    const game = document.getElementById('game');
    if (game) retranslate(game);
    const code = document.getElementById('join-code');
    if (code) code.placeholder = L.lang === 'ar' ? 'الكود' : 'CODE';
    const btn = document.getElementById('btn-lang');
    if (btn) btn.textContent = L.lang === 'ar' ? 'English' : 'عربي';
    document.title = L.lang === 'ar' ? 'GRAVEWAVE — الليلة الأخيرة في رصيف لومينا' : 'GRAVEWAVE — Last Night at Lumina Pier';
  };

  function init() {
    let lang = null;
    try {
      lang = localStorage.getItem(KEY);
    } catch (e) {
      /* storage unavailable */
    }
    if (!lang) {
      const langs = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || 'en'];
      lang = langs.some((l) => /^ar/i.test(l)) ? 'ar' : 'en';
    }
    const game = document.getElementById('game');
    if (game && window.MutationObserver) {
      new MutationObserver((list) => {
        if (L.lang !== 'ar') return;
        for (const m of list) {
          if (m.type === 'characterData') fixNode(m.target);
          else for (const n of m.addedNodes) if (n.nodeType === 1 || n.nodeType === 3) walk(n);
        }
      }).observe(game, { subtree: true, childList: true, characterData: true });
    }
    const btn = document.getElementById('btn-lang');
    if (btn)
      btn.addEventListener('click', () => {
        L.set(L.lang === 'ar' ? 'en' : 'ar');
      });
    L.set(lang);
  }

  if (typeof document !== 'undefined' && document.getElementById) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }
})();
