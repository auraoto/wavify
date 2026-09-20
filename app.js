/**
 * WAVIFY - Музыкальный плеер
 * Полноформатное воспроизведение (Full Track Streaming)
 * Отображение альбомов в топе и точные года выпуска
 */

// =========================================================
// 1. СЛОВАРИ ЛОКАЛИЗАЦИИ (RU / EN)
// =========================================================
const I18N = {
  ru: {
    accentColor: 'Акцентный цвет',
    siteName: 'Название',
    language: 'Язык',
    searchPlaceholder: 'Введите название песни или автора для поиска...',
    yandexMusic: 'Яндекс.Музыка',
    playlist: 'playlist',
    album: 'Альбом',
    cover: 'Обложка',
    createPlaylistTitle: 'Новый плейлист',
    playlistNamePlaceholder: 'Название плейлиста...',
    cancel: 'Отмена',
    create: 'Создать',
    noTracksFound: 'Ничего не найдено. Попробуйте другой запрос или измените фильтр.',
    searching: 'Ищем на стримингах...',
    addedToPlaylist: 'Трек добавлен в плейлист!',
    playlistCreated: 'Плейлист создан!',
    audioUnavailable: 'Аудио недоступно для этого трека',
    deletePlaylist: 'Удалить плейлист',
    yearOfRelease: 'Год выпуска',
    tracksCount: 'треков',
    albumsTitle: 'Альбомы',
    allTracks: 'Все треки',
    changeAvatar: 'Сменить фото',
    chooseAvatar: 'Выбрать обложку',
    removeAvatar: 'Удалить',
    titleUpdated: 'Название плейлиста обновлено!',
    avatarUpdated: 'Обложка плейлиста обновлена!',
    unknownArtist: 'Неизвестный исполнитель',
    unknownTitle: 'Без названия',
    pinToSidebar: 'В колонку слева',
    unpinFromSidebar: 'Удалить из колонки',
    albumAddedToSidebar: 'Альбом добавлен в колонку слева!',
    albumRemovedFromSidebar: 'Альбом удален из колонки!',
    lyrics: 'Текст песни',
    loadingLyrics: 'Ищем текст на Genius...',
    lyricsNotFound: 'Текст песни на Genius не найден',
    playTrackToViewLyrics: 'Воспроизведите трек для просмотра текста'
  },
  en: {
    accentColor: 'Accent color',
    siteName: 'Site title',
    language: 'Language',
    searchPlaceholder: 'Search for songs, artists, or albums...',
    yandexMusic: 'Yandex.Music',
    playlist: 'playlist',
    album: 'Album',
    cover: 'Cover',
    createPlaylistTitle: 'New Playlist',
    playlistNamePlaceholder: 'Playlist title...',
    cancel: 'Cancel',
    create: 'Create',
    noTracksFound: 'No tracks found. Try a different query.',
    searching: 'Searching across streamings...',
    addedToPlaylist: 'Track added to playlist!',
    playlistCreated: 'Playlist created!',
    audioUnavailable: 'Audio unavailable for this track',
    deletePlaylist: 'Delete playlist',
    yearOfRelease: 'Release year',
    tracksCount: 'tracks',
    albumsTitle: 'Albums',
    allTracks: 'All tracks',
    changeAvatar: 'Change photo',
    chooseAvatar: 'Choose cover',
    removeAvatar: 'Remove',
    titleUpdated: 'Playlist title updated!',
    avatarUpdated: 'Playlist cover updated!',
    unknownArtist: 'Unknown Artist',
    unknownTitle: 'Untitled',
    pinToSidebar: 'Pin to sidebar',
    unpinFromSidebar: 'Remove from sidebar',
    albumAddedToSidebar: 'Album pinned to sidebar!',
    albumRemovedFromSidebar: 'Album removed from sidebar!',
    lyrics: 'Lyrics',
    loadingLyrics: 'Loading lyrics from Genius...',
    lyricsNotFound: 'Lyrics not found on Genius',
    playTrackToViewLyrics: 'Play a track to view lyrics'
  }
};

// =========================================================
// 2. СОСТОЯНИЕ ПРИЛОЖЕНИЯ
// =========================================================
const state = {
  settings: {
    accentColor: localStorage.getItem('wavify_accent') || '#A046CA',
    siteName: localStorage.getItem('wavify_name') || 'wavify',
    lang: localStorage.getItem('wavify_lang') || 'ru'
  },
  
  // Плеер
  currentTrack: null,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  volume: parseFloat(localStorage.getItem('wavify_volume')) || 0.85,
  isMuted: false,
  repeatMode: 'off',
  isFullAudioStreaming: false,
  
  // Навигация
  currentView: 'home',
  historyStack: [{ view: 'home', data: null }],
  historyIndex: 0,
  
  // Сайдбар плейлистов и альбомов
  playlists: [],
  activePlaylistId: null,
  sidebarAlbums: [],
  activeAlbum: null,
  activeAlbumId: null,
  
  // Поиск: альбомы и треки
  currentAlbums: [],
  selectedAlbum: null,
  allSearchTracks: [],
  currentTracklist: [],
  lastSearchResults: null
};

// Очистка старых демо-плейлистов из localStorage
function purgeOldMockPlaylists() {
  const purgeKey = 'wavify_purged_mock_v4';
  if (!localStorage.getItem(purgeKey)) {
    localStorage.removeItem('wavify_playlists');
    localStorage.setItem(purgeKey, 'true');
    state.playlists = [];
    return;
  }

  const saved = localStorage.getItem('wavify_playlists');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      state.playlists = parsed.filter(pl => 
        pl && pl.id &&
        !pl.id.startsWith('pl-top') &&
        !pl.id.startsWith('pl-yandex') &&
        !pl.id.startsWith('pl-sc') &&
        !String(pl.title).toLowerCase().includes('soundcloud') &&
        !String(pl.title).toLowerCase().includes('top hits')
      );
      savePlaylists();
      return;
    } catch (e) {
      console.warn('Error parsing playlists:', e);
    }
  }
  state.playlists = [];
}

function savePlaylists() {
  localStorage.setItem('wavify_playlists', JSON.stringify(state.playlists));
}

function loadSidebarAlbums() {
  // Очищаем старые автоматически сохраненные альбомы при первой загрузке этой версии
  const purgeAlbumsKey = 'wavify_purged_auto_albums_v3';
  if (!localStorage.getItem(purgeAlbumsKey)) {
    localStorage.removeItem('wavify_sidebar_albums');
    localStorage.setItem(purgeAlbumsKey, 'true');
    state.sidebarAlbums = [];
    return;
  }

  const saved = localStorage.getItem('wavify_sidebar_albums');
  if (saved) {
    try {
      state.sidebarAlbums = JSON.parse(saved);
      return;
    } catch (e) {
      console.warn('Error parsing sidebar albums:', e);
    }
  }
  state.sidebarAlbums = [];
}

function saveSidebarAlbums() {
  localStorage.setItem('wavify_sidebar_albums', JSON.stringify(state.sidebarAlbums));
}

function addAlbumToSidebar(album) {
  if (!album || !album.title) return;
  const exists = state.sidebarAlbums.some(a => 
    (album.id && a.id === album.id) || 
    (a.title && a.title.toLowerCase() === album.title.toLowerCase() && 
     a.artist && a.artist.toLowerCase() === (album.artist || '').toLowerCase())
  );
  if (!exists) {
    state.sidebarAlbums.push({
      id: album.id || `alb-${Date.now()}`,
      title: album.title,
      artist: album.artist || '',
      cover: album.cover || '',
      year: album.year || '',
      source: album.source || 'yandex'
    });
    saveSidebarAlbums();
    renderSidebar();
  }
}

// =========================================================
// 3. DOM ЭЛЕМЕНТЫ
// =========================================================
const dom = {
  appContainer: document.getElementById('appContainer'),
  btnHistoryBack: document.getElementById('btnHistoryBack'),
  btnHistoryForward: document.getElementById('btnHistoryForward'),
  
  // Настройки
  settingsBtn: document.getElementById('settingsBtn'),
  settingsPopover: document.getElementById('settingsPopover'),
  accentColorInput: document.getElementById('accentColorInput'),
  accentColorPreview: document.getElementById('accentColorPreview'),
  siteNameInput: document.getElementById('siteNameInput'),
  siteLogoText: document.getElementById('siteLogoText'),
  langPills: document.querySelectorAll('.lang-pill'),
  presetDots: document.querySelectorAll('.preset-dot'),

  // Сайдбар
  sidebarItems: document.getElementById('sidebarItems'),
  sidebarPlaylistPopout: document.getElementById('sidebarPlaylistPopout'),
  btnSidebarPlaylistPill: document.getElementById('btnSidebarPlaylistPill'),
  btnNewPlaylist: document.getElementById('btnNewPlaylist'),

  // Поиск
  searchSection: document.getElementById('searchSection'),
  searchInput: document.getElementById('searchInput'),
  searchClearBtn: document.getElementById('searchClearBtn'),

  // Контент
  viewViewport: document.getElementById('viewViewport'),
  heroSection: document.getElementById('heroSection'),
  heroCoverBox: document.getElementById('heroCoverBox'),
  heroCoverImg: document.getElementById('heroCoverImg'),
  heroCoverPlaceholder: document.getElementById('heroCoverPlaceholder'),
  heroPlaceholderText: document.getElementById('heroPlaceholderText'),
  btnHeroPlay: document.getElementById('btnHeroPlay'),
  btnEditPlaylistCover: document.getElementById('btnEditPlaylistCover'),
  playlistCoverFileInput: document.getElementById('playlistCoverFileInput'),
  heroTitle: document.getElementById('heroTitle'),
  btnEditPlaylistTitle: document.getElementById('btnEditPlaylistTitle'),
  btnPinAlbum: document.getElementById('btnPinAlbum'),
  heroTitleInput: document.getElementById('heroTitleInput'),
  heroAuthor: document.getElementById('heroAuthor'),
  heroExtra: document.getElementById('heroExtra'),
  
  // Альбомы (витрина всех альбомов по референсу)
  albumsShowcaseSection: document.getElementById('albumsShowcaseSection'),
  albumsGridRow: document.getElementById('albumsGridRow'),
  btnResetAlbumFilter: document.getElementById('btnResetAlbumFilter'),

  // Треки
  tracksContainer: document.getElementById('tracksContainer'),
  emptyNotice: document.getElementById('emptyNotice'),
  loadingIndicator: document.getElementById('loadingIndicator'),

  // Аудио плеер
  audioElement: document.getElementById('audioElement'),
  playerThumbImg: document.getElementById('playerThumbImg'),
  playerThumbPlaceholder: document.getElementById('playerThumbPlaceholder'),
  playerTrackTitle: document.getElementById('playerTrackTitle'),
  playerTrackAuthor: document.getElementById('playerTrackAuthor'),
  btnPlayerAddToPlaylist: document.getElementById('btnPlayerAddToPlaylist'),
  btnPrevTrack: document.getElementById('btnPrevTrack'),
  btnPlayPause: document.getElementById('btnPlayPause'),
  playIcon: document.getElementById('playIcon'),
  pauseIcon: document.getElementById('pauseIcon'),
  btnNextTrack: document.getElementById('btnNextTrack'),
  currentTimeLabel: document.getElementById('currentTimeLabel'),
  totalTimeLabel: document.getElementById('totalTimeLabel'),
  timelineTrack: document.getElementById('timelineTrack'),
  timelineFill: document.getElementById('timelineFill'),
  timelineThumb: document.getElementById('timelineThumb'),
  btnRepeat: document.getElementById('btnRepeat'),
  btnLyrics: document.getElementById('btnLyrics'),
  btnVolumeMute: document.getElementById('btnVolumeMute'),
  volumeTrack: document.getElementById('volumeTrack'),
  volumeFill: document.getElementById('volumeFill'),

  // Тексты песен (Genius Lyrics)
  lyricsModalBackdrop: document.getElementById('lyricsModalBackdrop'),
  lyricsTrackThumb: document.getElementById('lyricsTrackThumb'),
  lyricsTrackTitle: document.getElementById('lyricsTrackTitle'),
  lyricsTrackArtist: document.getElementById('lyricsTrackArtist'),
  btnCloseLyrics: document.getElementById('btnCloseLyrics'),
  lyricsLoading: document.getElementById('lyricsLoading'),
  lyricsContent: document.getElementById('lyricsContent'),
  lyricsGeniusLink: document.getElementById('lyricsGeniusLink'),

  // Модалка создания плейлиста
  playlistModalBackdrop: document.getElementById('playlistModalBackdrop'),
  playlistModalTitle: document.getElementById('playlistModalTitle'),
  modalAvatarPreview: document.getElementById('modalAvatarPreview'),
  modalAvatarPlaceholder: document.getElementById('modalAvatarPlaceholder'),
  modalAvatarImg: document.getElementById('modalAvatarImg'),
  btnPickModalAvatar: document.getElementById('btnPickModalAvatar'),
  btnRemoveModalAvatar: document.getElementById('btnRemoveModalAvatar'),
  modalAvatarFileInput: document.getElementById('modalAvatarFileInput'),
  newPlaylistNameInput: document.getElementById('newPlaylistNameInput'),
  btnCancelPlaylist: document.getElementById('btnCancelPlaylist'),
  btnConfirmPlaylist: document.getElementById('btnConfirmPlaylist'),

  // Toast
  toastNotification: document.getElementById('toastNotification'),
  toastText: document.getElementById('toastText')
};

// =========================================================
// 4. ИНИЦИАЛИЗАЦИЯ
// =========================================================
function init() {
  purgeOldMockPlaylists();
  loadSidebarAlbums();
  applyAccentColor(state.settings.accentColor);
  applySiteName(state.settings.siteName);
  applyLanguage(state.settings.lang);
  
  renderSidebar();
  setupEventListeners();
  updateHistoryButtons();

  dom.audioElement.volume = state.volume;
  updateVolumeUI(state.volume);

  dom.playerTrackTitle.textContent = 'wavify';
  dom.playerTrackAuthor.textContent = state.settings.lang === 'ru' ? 'Выберите трек для воспроизведения' : 'Select a track to play';

  renderHomeScreen();
}

function applyAccentColor(color) {
  state.settings.accentColor = color;
  localStorage.setItem('wavify_accent', color);
  document.documentElement.style.setProperty('--accent-color', color);
  
  const glow = hexToRgba(color, 0.4);
  document.documentElement.style.setProperty('--accent-glow', glow);

  dom.accentColorInput.value = color;
  dom.accentColorPreview.style.backgroundColor = color;
}

function applySiteName(name) {
  const cleanName = (name || 'wavify').trim();
  state.settings.siteName = cleanName;
  localStorage.setItem('wavify_name', cleanName);
  
  dom.siteLogoText.textContent = cleanName;
  dom.siteNameInput.value = cleanName;
  document.title = `${cleanName} - Музыкальный плеер`;
}

function applyLanguage(lang) {
  state.settings.lang = lang;
  localStorage.setItem('wavify_lang', lang);
  
  const dict = I18N[lang] || I18N.ru;
  document.documentElement.lang = lang;

  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (dict[key]) {
      el.textContent = dict[key];
    }
  });

  dom.searchInput.placeholder = dict.searchPlaceholder;
  dom.newPlaylistNameInput.placeholder = dict.playlistNamePlaceholder;

  dom.langPills.forEach(pill => {
    pill.classList.toggle('active', pill.dataset.lang === lang);
  });

  renderSidebar();
}

function t(key) {
  const dict = I18N[state.settings.lang] || I18N.ru;
  return dict[key] || key;
}

function hexToRgba(hex, alpha = 1) {
  let c = hex.replace('#', '');
  if (c.length === 3) {
    c = c.split('').map(x => x + x).join('');
  }
  const num = parseInt(c, 16);
  return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${alpha})`;
}

// =========================================================
// =========================================================
// 5. САЙДБАР: ПЛЕЙЛИСТЫ + АЛЬБОМЫ (media_1789924739913.png)
// =========================================================
function renderSidebar() {
  dom.sidebarItems.innerHTML = '';

  // 1. Плейлисты
  state.playlists.forEach((pl) => {
    const card = document.createElement('div');
    const isActive = state.currentView === 'playlist' && state.activePlaylistId === pl.id;
    card.className = `sidebar-item-card ${isActive ? 'active' : ''}`;
    card.title = pl.title;
    
    if (pl.cover && (pl.cover.startsWith('http') || pl.cover.startsWith('data:image'))) {
      card.innerHTML = `<img src="${pl.cover}" class="sidebar-item-img" alt="${escapeHtml(pl.title)}">`;
    } else {
      card.innerHTML = `<span>${escapeHtml(pl.title.substring(0, 8))}</span>`;
    }

    card.addEventListener('click', () => {
      navigateTo('playlist', pl.id);
    });

    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (confirm(`${t('deletePlaylist')}: "${pl.title}"?`)) {
        state.playlists = state.playlists.filter(p => p.id !== pl.id);
        savePlaylists();
        renderSidebar();
        if (state.activePlaylistId === pl.id) {
          navigateTo('home');
        }
      }
    });

    dom.sidebarItems.appendChild(card);
  });

  // 2. Альбомы в левой колонке (ровно по референсу media_1789924739913.png)
  state.sidebarAlbums.forEach((alb) => {
    const card = document.createElement('div');
    const isAlbActive = state.currentView === 'album' && state.activeAlbum && 
      ((alb.id && state.activeAlbum.id === alb.id) || (state.activeAlbum.title && state.activeAlbum.title.toLowerCase() === alb.title.toLowerCase()));
    card.className = `sidebar-item-card sidebar-album-item ${isAlbActive ? 'active' : ''}`;
    card.title = `${alb.title} — ${alb.artist}`;

    if (alb.cover && (alb.cover.startsWith('http') || alb.cover.startsWith('data:image'))) {
      card.innerHTML = `<img src="${alb.cover}" class="sidebar-item-img" alt="${escapeHtml(alb.title)}">`;
    } else {
      card.innerHTML = `<span>album</span>`;
    }

    card.addEventListener('click', () => {
      navigateTo('album', alb);
    });

    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (confirm(`Удалить альбом "${alb.title}" из колонки?`)) {
        state.sidebarAlbums = state.sidebarAlbums.filter(a => a.id !== alb.id && a.title !== alb.title);
        saveSidebarAlbums();
        renderSidebar();
        if (state.currentView === 'album' && state.activeAlbum && (state.activeAlbum.id === alb.id || state.activeAlbum.title === alb.title)) {
          navigateTo('home');
        }
      }
    });

    dom.sidebarItems.appendChild(card);
  });
}

// =========================================================
// 6. НАВИГАЦИЯ
// =========================================================
function navigateTo(view, data = null, addToHistory = true) {
  state.currentView = view;
  
  if (addToHistory) {
    if (view === 'search' && state.historyIndex >= 0 && state.historyStack[state.historyIndex]?.view === 'search') {
      state.historyStack[state.historyIndex].data = data;
    } else {
      state.historyStack = state.historyStack.slice(0, state.historyIndex + 1);
      state.historyStack.push({ view, data });
      state.historyIndex = state.historyStack.length - 1;
    }
  }
  
  updateHistoryButtons();

  if (view === 'home') {
    renderHomeScreen();
  } else if (view === 'playlist') {
    renderPlaylistView(data);
  } else if (view === 'search') {
    renderSearchResultsView(data);
  } else if (view === 'album') {
    renderAlbumView(data);
  }
}

function updateHistoryButtons() {
  dom.btnHistoryBack.disabled = state.historyIndex <= 0;
  dom.btnHistoryForward.disabled = state.historyIndex >= state.historyStack.length - 1;
}

function handleHistoryBack() {
  if (state.historyIndex > 0) {
    state.historyIndex--;
    const step = state.historyStack[state.historyIndex];
    navigateTo(step.view, step.data, false);
  }
}

function handleHistoryForward() {
  if (state.historyIndex < state.historyStack.length - 1) {
    state.historyIndex++;
    const step = state.historyStack[state.historyIndex];
    navigateTo(step.view, step.data, false);
  }
}

function renderHomeScreen() {
  state.activePlaylistId = null;
  state.activeAlbum = null;
  state.activeAlbumId = null;
  renderSidebar();

  if (currentSearchAbortController) {
    try { currentSearchAbortController.abort(); } catch (e) {}
  }
  state.lastSearchResults = null;

  dom.searchSection.style.display = 'flex';
  dom.searchSection.classList.remove('top-mode');
  dom.searchSection.classList.add('centered-mode');
  dom.heroSection.classList.remove('is-playlist');
  dom.heroSection.classList.remove('is-album');
  dom.heroSection.style.display = 'none';
  if (dom.btnEditPlaylistTitle) dom.btnEditPlaylistTitle.style.display = 'none';
  if (dom.btnPinAlbum) dom.btnPinAlbum.style.display = 'none';
  if (dom.heroTitleInput) dom.heroTitleInput.style.display = 'none';
  if (dom.heroTitle) dom.heroTitle.style.display = 'block';

  dom.albumsShowcaseSection.style.display = 'none';
  dom.tracksContainer.innerHTML = '';
  dom.emptyNotice.style.display = 'none';
  dom.loadingIndicator.style.display = 'none';
  dom.searchInput.value = '';
  dom.searchClearBtn.style.display = 'none';
}

function renderPlaylistView(playlistId) {
  const pl = state.playlists.find(p => p.id === playlistId);
  if (!pl) return;

  state.activePlaylistId = pl.id;
  state.activeAlbum = null;
  state.activeAlbumId = null;
  renderSidebar();

  dom.searchSection.style.display = 'none';
  dom.albumsShowcaseSection.style.display = 'none';
  dom.emptyNotice.style.display = 'none';
  dom.loadingIndicator.style.display = 'none';

  dom.heroSection.classList.remove('is-album');
  dom.heroSection.classList.add('is-playlist');
  dom.heroSection.style.display = 'flex';

  dom.heroTitle.textContent = pl.title;
  dom.heroTitle.style.display = 'block';
  if (dom.heroTitleInput) {
    dom.heroTitleInput.style.display = 'none';
    dom.heroTitleInput.value = pl.title;
  }
  if (dom.btnEditPlaylistTitle) {
    dom.btnEditPlaylistTitle.style.display = 'flex';
  }
  if (dom.btnPinAlbum) {
    dom.btnPinAlbum.style.display = 'none';
  }

  dom.heroAuthor.textContent = pl.author || 'wavify';
  dom.heroExtra.textContent = `${pl.tracks.length} ${t('tracksCount')}`;

  if (pl.cover && (pl.cover.startsWith('http') || pl.cover.startsWith('data:image'))) {
    dom.heroCoverImg.src = pl.cover;
    dom.heroCoverImg.style.display = 'block';
    dom.heroCoverPlaceholder.style.display = 'none';
  } else {
    dom.heroCoverImg.style.display = 'none';
    dom.heroCoverPlaceholder.style.display = 'block';
    dom.heroPlaceholderText.textContent = 'playlist';
  }

  dom.btnHeroPlay.onclick = () => {
    if (pl.tracks && pl.tracks.length > 0) {
      playTrack(pl.tracks[0], pl.tracks);
    }
  };

  state.currentTracklist = pl.tracks;
  renderTracksList(pl.tracks);
}

// СТРАНИЦА АЛЬБОМА (media_1789924739913.png)
async function renderAlbumView(album) {
  if (!album) return;

  state.activeAlbum = album;
  state.activeAlbumId = album.id;
  state.activePlaylistId = null;

  dom.searchSection.style.display = 'none';
  dom.albumsShowcaseSection.style.display = 'none';
  dom.emptyNotice.style.display = 'none';

  dom.heroSection.classList.remove('is-playlist');
  dom.heroSection.classList.add('is-album');
  dom.heroSection.style.display = 'flex';

  // Метаданные альбома (Title, Author, Year of release)
  dom.heroTitle.textContent = album.title;
  dom.heroTitle.style.display = 'block';
  if (dom.heroTitleInput) dom.heroTitleInput.style.display = 'none';
  if (dom.btnEditPlaylistTitle) dom.btnEditPlaylistTitle.style.display = 'none';

  if (dom.btnPinAlbum) {
    dom.btnPinAlbum.style.display = 'flex';
    const isPinned = state.sidebarAlbums.some(a => 
      (album.id && a.id === album.id) || 
      (a.title && a.title.toLowerCase() === album.title.toLowerCase() && 
       a.artist && a.artist.toLowerCase() === (album.artist || '').toLowerCase())
    );
    dom.btnPinAlbum.classList.toggle('pinned', isPinned);
    dom.btnPinAlbum.title = isPinned ? t('unpinFromSidebar') : t('pinToSidebar');

    dom.btnPinAlbum.onclick = (e) => {
      e.stopPropagation();
      const idx = state.sidebarAlbums.findIndex(a => 
        (album.id && a.id === album.id) || 
        (a.title && a.title.toLowerCase() === album.title.toLowerCase() && 
         a.artist && a.artist.toLowerCase() === (album.artist || '').toLowerCase())
      );
      if (idx >= 0) {
        state.sidebarAlbums.splice(idx, 1);
        saveSidebarAlbums();
        renderSidebar();
        dom.btnPinAlbum.classList.remove('pinned');
        dom.btnPinAlbum.title = t('pinToSidebar');
        showToast(t('albumRemovedFromSidebar'));
      } else {
        addAlbumToSidebar(album);
        dom.btnPinAlbum.classList.add('pinned');
        dom.btnPinAlbum.title = t('unpinFromSidebar');
        showToast(t('albumAddedToSidebar'));
      }
    };
  }

  dom.heroAuthor.textContent = album.artist;
  const yearText = album.year ? `${album.year}` : t('yearOfRelease');
  dom.heroExtra.textContent = yearText;

  if (album.cover && (album.cover.startsWith('http') || album.cover.startsWith('data:image'))) {
    dom.heroCoverImg.src = album.cover;
    dom.heroCoverImg.style.display = 'block';
    dom.heroCoverPlaceholder.style.display = 'none';
  } else {
    dom.heroCoverImg.style.display = 'none';
    dom.heroCoverPlaceholder.style.display = 'block';
    dom.heroPlaceholderText.textContent = 'album';
  }

  dom.tracksContainer.innerHTML = '';
  dom.loadingIndicator.style.display = 'flex';

  // Если у альбома уже сохранены треки в памяти
  if (album.tracks && album.tracks.length > 0) {
    dom.loadingIndicator.style.display = 'none';
    state.currentTracklist = album.tracks;
    dom.heroExtra.textContent = `${album.year || ''} • ${album.tracks.length} ${t('tracksCount')}`;
    dom.btnHeroPlay.onclick = () => {
      playTrack(album.tracks[0], album.tracks);
    };
    renderTracksList(album.tracks, { isAlbum: true });
    return;
  }

  // Загружаем официальный упорядоченный треклист альбома с сервера
  try {
    const params = new URLSearchParams({
      id: album.id || '',
      artist: album.artist || '',
      title: album.title || '',
      source: album.source || ''
    });

    const res = await fetch(`/api/album-tracks?${params.toString()}`);
    if (!res.ok) throw new Error('Failed to fetch album tracks');
    const data = await res.json();
    const tracks = data.tracks || [];

    dom.loadingIndicator.style.display = 'none';

    if (tracks.length > 0) {
      album.tracks = tracks;
      state.currentTracklist = tracks;
      dom.heroExtra.textContent = `${album.year || ''} • ${tracks.length} ${t('tracksCount')}`;
      dom.btnHeroPlay.onclick = () => {
        playTrack(tracks[0], tracks);
      };
      renderTracksList(tracks, { isAlbum: true });
    } else {
      const fallback = state.allSearchTracks.filter(t => 
        (t.album && t.album.toLowerCase() === album.title.toLowerCase()) ||
        (t.artist && t.artist.toLowerCase() === album.artist.toLowerCase())
      );
      if (fallback.length > 0) {
        state.currentTracklist = fallback;
        dom.heroExtra.textContent = `${album.year || ''} • ${fallback.length} ${t('tracksCount')}`;
        dom.btnHeroPlay.onclick = () => {
          playTrack(fallback[0], fallback);
        };
        renderTracksList(fallback, { isAlbum: true });
      } else {
        dom.emptyNotice.style.display = 'block';
      }
    }
  } catch (err) {
    console.error('Error loading album tracks:', err);
    dom.loadingIndicator.style.display = 'none';
    const fallback = state.allSearchTracks.filter(t => 
      t.album && t.album.toLowerCase() === album.title.toLowerCase()
    );
    if (fallback.length > 0) {
      state.currentTracklist = fallback;
      renderTracksList(fallback, { isAlbum: true });
    } else {
      dom.emptyNotice.style.display = 'block';
    }
  }
}

function renderSearchResultsView(query) {
  state.activePlaylistId = null;
  state.activeAlbum = null;
  state.activeAlbumId = null;
  renderSidebar();

  dom.searchSection.style.display = 'flex';
  dom.searchSection.classList.remove('centered-mode');
  dom.searchSection.classList.add('top-mode');
  dom.heroSection.classList.remove('is-playlist');
  dom.heroSection.classList.remove('is-album');
  dom.heroSection.style.display = 'none';
  if (dom.btnEditPlaylistTitle) dom.btnEditPlaylistTitle.style.display = 'none';
  if (dom.btnPinAlbum) dom.btnPinAlbum.style.display = 'none';
  if (dom.heroTitleInput) dom.heroTitleInput.style.display = 'none';
  if (dom.heroTitle) dom.heroTitle.style.display = 'block';

  const finalQuery = (query !== undefined && query !== null ? String(query) : dom.searchInput.value).trim();
  dom.searchInput.value = finalQuery;
  dom.searchClearBtn.style.display = finalQuery ? 'block' : 'none';

  // Если у нас уже есть закэшированные результаты для этого точного запроса, восстанавливаем их МГНОВЕННО без перезагрузок и рандомных треков
  if (state.lastSearchResults && 
      state.lastSearchResults.query.toLowerCase() === finalQuery.toLowerCase() &&
      (state.lastSearchResults.tracks.length > 0 || state.lastSearchResults.albums.length > 0)) {
    dom.loadingIndicator.style.display = 'none';
    dom.emptyNotice.style.display = 'none';
    state.currentAlbums = state.lastSearchResults.albums;
    state.allSearchTracks = state.lastSearchResults.tracks;
    state.currentTracklist = state.lastSearchResults.tracks;
    renderAlbumsShowcase(state.lastSearchResults.albums);
    renderTracksList(state.lastSearchResults.tracks);
    return;
  }

  performSearch(finalQuery);
}

// =========================================================
// 7. ПОИСК: АЛЬБОМЫ СВЕРХУ + ТРЕКИ СНИЗУ
// =========================================================
let searchDebounceTimer = null;
let currentSearchAbortController = null;
let activeSearchRequestId = 0;

function handleSearchInput() {
  const query = dom.searchInput.value.trim();
  dom.searchClearBtn.style.display = query ? 'block' : 'none';

  clearTimeout(searchDebounceTimer);
  if (!query) {
    if (currentSearchAbortController) {
      try { currentSearchAbortController.abort(); } catch (e) {}
    }
    state.lastSearchResults = null;
    if (state.currentView === 'search') {
      navigateTo('home');
    }
    return;
  }

  // Для 1 буквы даём больше времени (420мс), чтобы не отправлять тяжёлые промежуточные запросы во время быстрого набора
  const delay = query.length === 1 ? 420 : 250;

  searchDebounceTimer = setTimeout(() => {
    if (state.currentView !== 'search') {
      navigateTo('search', query);
    } else {
      performSearch(query);
    }
  }, delay);
}

function fetchJsonp(url, timeout = 3500) {
  return new Promise((resolve, reject) => {
    const cbName = 'wavify_cb_' + Math.random().toString(36).substring(2, 9);
    const script = document.createElement('script');
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('JSONP timeout'));
    }, timeout);

    function cleanup() {
      clearTimeout(timer);
      if (script.parentNode) script.parentNode.removeChild(script);
      delete window[cbName];
    }

    window[cbName] = function(data) {
      cleanup();
      resolve(data);
    };

    const sep = url.includes('?') ? '&' : '?';
    script.src = `${url}${sep}callback=${cbName}`;
    script.onerror = () => {
      cleanup();
      reject(new Error('JSONP script error'));
    };
    document.head.appendChild(script);
  });
}

async function performSearch(query) {
  if (!query) return;

  // Отменяем любой предыдущий сетевой запрос поиска
  if (currentSearchAbortController) {
    try { currentSearchAbortController.abort(); } catch (e) {}
  }
  currentSearchAbortController = new AbortController();
  const searchId = ++activeSearchRequestId;

  // Обновляем текущую запись в стеке истории, чтобы стрелка "назад" всегда вела на финальный запрос
  if (state.historyIndex >= 0 && state.historyStack[state.historyIndex]?.view === 'search') {
    state.historyStack[state.historyIndex].data = query;
  }

  dom.loadingIndicator.style.display = 'block';
  dom.emptyNotice.style.display = 'none';
  dom.heroSection.style.display = 'none';
  dom.albumsShowcaseSection.style.display = 'none';
  dom.tracksContainer.innerHTML = '';
  state.selectedAlbum = null;
  if (dom.btnResetAlbumFilter) {
    dom.btnResetAlbumFilter.style.display = 'none';
  }

  let albums = [];
  let tracks = [];

  // 1. Запрос к серверу /api/search (возвращает ВСЕ альбомы и ВСЕ треки со всех стримингов)
  try {
    const serverUrl = `/api/search?q=${encodeURIComponent(query)}`;
    const resp = await fetch(serverUrl, { signal: currentSearchAbortController.signal });
    if (resp.ok) {
      const data = await resp.json();
      if (data.albums) albums = data.albums;
      if (data.results) tracks = data.results;
    }
  } catch (err) {
    if (err.name === 'AbortError') return; // Запрос был отменён новым поиском — игнорируем!
    console.log('Server search not available, using JSONP:', err);
  }

  // 2. Фоллбек через Deezer JSONP если сервер не ответил
  if (tracks.length === 0 && (!albums || albums.length === 0)) {
    try {
      const dzUrl = `https://api.deezer.com/search?q=${encodeURIComponent(query)}&output=jsonp&limit=30`;
      const dzData = await fetchJsonp(dzUrl, 3500);
      if (dzData && dzData.data) {
        dzData.data.forEach(item => {
          tracks.push({
            id: `dz-${item.id}`,
            title: item.title,
            artist: item.artist?.name || '',
            album: item.album?.title || '',
            year: '2023',
            source: 'deezer',
            duration: item.duration || 180,
            cover: item.album?.cover_medium || item.artist?.picture_medium || '',
            audioUrl: item.preview || '',
            streamUrl: `/api/stream?artist=${encodeURIComponent(item.artist?.name || '')}&title=${encodeURIComponent(item.title)}`
          });
        });
      }
    } catch (e) {}
  }

  // КРИТИЧЕСКАЯ ПРОВЕРКА RACE CONDITION:
  // Если за время запроса пришёл более свежий запрос или пользователь ввёл другое слово в поиск — НЕ ОТОБРАЖАЕМ УСТАРЕВШИЙ!
  if (searchId !== activeSearchRequestId) {
    return;
  }
  const currentInputValue = dom.searchInput.value.trim();
  if (currentInputValue && currentInputValue.toLowerCase() !== query.toLowerCase()) {
    return;
  }

  // Если сервер не вернул альбомы, извлекаем альбомы из найденных треков
  if (albums.length === 0 && tracks.length > 0) {
    const seen = new Set();
    tracks.forEach(tr => {
      const albName = (tr.album || '').trim();
      if (albName && !seen.has(albName.toLowerCase())) {
        seen.add(albName.toLowerCase());
        albums.push({
          id: `alb-auto-${albums.length}`,
          title: albName,
          artist: tr.artist,
          year: tr.year || '2023',
          cover: tr.cover,
          source: tr.source
        });
      }
    });
  }

  dom.loadingIndicator.style.display = 'none';

  if (tracks.length === 0 && albums.length === 0) {
    dom.emptyNotice.style.display = 'block';
    state.lastSearchResults = { query, albums: [], tracks: [] };
    return;
  }

  // Сохраняем в кэш для мгновенного восстановления при клике на стрелку "назад"
  state.lastSearchResults = { query, albums, tracks };
  state.currentAlbums = albums;
  state.allSearchTracks = tracks;
  state.currentTracklist = tracks;

  // Витрина ВСЕХ найденных альбомов сверху (ровно по референсу media_1789921242993.png)
  renderAlbumsShowcase(albums);

  // Список всех треков снизу
  renderTracksList(tracks);
}

// ВИТРИНА ВСЕХ АЛЬБОМОВ (media_1789921242993.png)
function renderAlbumsShowcase(albums) {
  if (!albums || albums.length === 0) {
    dom.albumsShowcaseSection.style.display = 'none';
    return;
  }

  dom.albumsShowcaseSection.style.display = 'flex';
  dom.albumsGridRow.innerHTML = '';

  albums.forEach(alb => {
    const card = document.createElement('div');
    const isSelected = state.selectedAlbum && state.selectedAlbum.title.toLowerCase() === alb.title.toLowerCase();
    card.className = `album-card ${isSelected ? 'active' : ''}`;
    card.dataset.albumTitle = alb.title;

    card.innerHTML = `
      <div class="album-cover-squircle">
        ${alb.cover ? `<img src="${alb.cover}" class="album-cover-img" alt="cover">` : `<span class="album-cover-placeholder-text">cover</span>`}
        <button type="button" class="album-play-btn" title="Слушать альбом">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
        </button>
      </div>
      <div class="album-card-info">
        <div class="album-card-top-line">
          <span class="album-card-title" title="${escapeHtml(alb.title)}">${escapeHtml(alb.title)}</span>
          <span class="album-card-year">${escapeHtml(alb.year || '')}</span>
        </div>
        <div class="album-card-author" title="${escapeHtml(alb.artist)}">${escapeHtml(alb.artist)}</div>
      </div>
    `;

    card.addEventListener('click', (e) => {
      if (e.target.closest('.album-play-btn')) {
        e.stopPropagation();
        playAlbumTracks(alb);
        return;
      }
      openAlbum(alb);
    });

    dom.albumsGridRow.appendChild(card);
  });
}

function openAlbum(album) {
  navigateTo('album', album);
}

function filterTracksByAlbum(album) {
  openAlbum(album);
}

function resetAlbumFilter() {
  state.selectedAlbum = null;
  document.querySelectorAll('.album-card').forEach(c => c.classList.remove('active'));
  if (dom.btnResetAlbumFilter) {
    dom.btnResetAlbumFilter.style.display = 'none';
  }
  state.currentTracklist = state.allSearchTracks;
  renderTracksList(state.allSearchTracks);
}

function playAlbumTracks(album) {
  openAlbum(album);
}

function renderTracksList(tracks, options = {}) {
  dom.tracksContainer.innerHTML = '';

  if (!tracks || tracks.length === 0) {
    return;
  }

  tracks.forEach((track, idx) => {
    const isThisPlaying = state.currentTrack && state.currentTrack.id === track.id && state.isPlaying;
    
    const row = document.createElement('div');
    row.className = `track-row-capsule ${isThisPlaying ? 'playing' : ''}`;
    row.id = `trackRow-${track.id}`;

    const sourceBadge = getSourceBadgeHtml(track.source);
    const trackOrderNum = track.trackNumber || (idx + 1);

    row.innerHTML = `
      ${options.isAlbum ? `<span class="track-order-num">${trackOrderNum}</span>` : ''}
      <div class="track-thumb-circle">
        ${track.cover ? `<img src="${track.cover}" class="track-thumb-img" alt="cover">` : 'cover'}
      </div>
      
      <div class="track-info-col">
        <div class="track-row-title">${escapeHtml(track.title)}</div>
        <div class="track-row-author">${escapeHtml(track.artist)}</div>
      </div>

      <div class="track-row-right">
        <div class="equalizer-waves">
          <span class="eq-bar"></span>
          <span class="eq-bar"></span>
          <span class="eq-bar"></span>
        </div>
        <button type="button" class="track-row-lyrics-btn" title="${t('lyrics')}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            <line x1="9" y1="9" x2="15" y2="9"></line>
            <line x1="9" y1="13" x2="13" y2="13"></line>
          </svg>
        </button>
        ${sourceBadge}
        <span class="track-row-duration">${formatTime(track.duration)}</span>
      </div>
    `;

    const rowLyricsBtn = row.querySelector('.track-row-lyrics-btn');
    if (rowLyricsBtn) {
      rowLyricsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openLyricsModal(track);
      });
    }

    row.addEventListener('click', () => {
      playTrack(track, tracks);
    });

    dom.tracksContainer.appendChild(row);
  });
}

function getSourceBadgeHtml(source) {
  if (source === 'deezer') {
    return `<span class="track-source-badge" style="color: #A238FF;">
      <img src="assets/deezer.png" class="badge-logo-img" alt="Deezer">
      Deezer
    </span>`;
  }
  if (source === 'yandex') {
    return `<span class="track-source-badge" style="color: #FFCC00;">
      <img src="assets/yandex.png" class="badge-logo-img" alt="Yandex">
      ${t('yandexMusic')}
    </span>`;
  }
  if (source === 'soundcloud') {
    return `<span class="track-source-badge" style="color: #FF5500;">
      <img src="assets/soundcloud.png" class="badge-logo-img" alt="SoundCloud">
      SoundCloud
    </span>`;
  }
  return '';
}

// =========================================================
// 8. ПОЛНОФОРМАТНЫЙ АУДИОПЛЕЕР (FULL TRACK STREAMING)
//    Никаких 30-секундных лимитов - полные песни от начала до конца
// =========================================================
function playTrack(track, list = null) {
  if (list && Array.isArray(list) && list.length > 0) {
    state.currentTracklist = list;
  }

  state.currentTrack = track;
  state.isFullAudioStreaming = true;

  dom.playerTrackTitle.textContent = track.title;
  dom.playerTrackAuthor.textContent = track.artist;
  
  if (track.cover) {
    dom.playerThumbImg.src = track.cover;
    dom.playerThumbImg.style.display = 'block';
    dom.playerThumbPlaceholder.style.display = 'none';
  } else {
    dom.playerThumbImg.style.display = 'none';
    dom.playerThumbPlaceholder.style.display = 'block';
  }

  // Прямой стриминг полного трека через /api/stream
  const streamEndpoint = track.streamUrl || `/api/stream?artist=${encodeURIComponent(track.artist)}&title=${encodeURIComponent(track.title)}`;
  const finalAudioSource = track.directStreamUrl || streamEndpoint;

  dom.audioElement.src = finalAudioSource;
  dom.audioElement.play().then(() => {
    state.isPlaying = true;
    updatePlayPauseButtons(true);
    highlightActivePlayingRow();
  }).catch((err) => {
    console.warn('Playback error, trying preview fallback if available:', err);
    if (track.audioUrl && track.audioUrl !== finalAudioSource) {
      dom.audioElement.src = track.audioUrl;
      dom.audioElement.play().then(() => {
        state.isPlaying = true;
        updatePlayPauseButtons(true);
        highlightActivePlayingRow();
      }).catch(console.error);
    }
  });

  // В фоне запрашиваем и кэшируем прямую ссылку
  fetchFullAudioUrl(track);

  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      album: track.album || 'wavify',
      artwork: [{ src: track.cover || '', sizes: '300x300', type: 'image/jpeg' }]
    });
  }
}

async function fetchFullAudioUrl(track) {
  try {
    const qUrl = `/api/full-audio-info?artist=${encodeURIComponent(track.artist)}&title=${encodeURIComponent(track.title)}`;
    const resp = await fetch(qUrl);
    if (resp.ok) {
      const data = await resp.json();
      if (data.fullAudioUrl) {
        track.directStreamUrl = data.fullAudioUrl;
      }
    }
  } catch (e) {}
}

function togglePlayPause() {
  if (!state.currentTrack) {
    if (state.currentTracklist.length > 0) {
      playTrack(state.currentTracklist[0]);
    }
    return;
  }

  if (state.isPlaying) {
    dom.audioElement.pause();
    state.isPlaying = false;
    updatePlayPauseButtons(false);
  } else {
    if (dom.audioElement.src) {
      dom.audioElement.play().then(() => {
        state.isPlaying = true;
        updatePlayPauseButtons(true);
      }).catch(console.warn);
    }
  }

  highlightActivePlayingRow();
}

function playNextTrack() {
  if (!state.currentTracklist || state.currentTracklist.length === 0) return;
  
  const currentIndex = state.currentTracklist.findIndex(t => t.id === state.currentTrack?.id);
  let nextIndex = currentIndex + 1;
  if (nextIndex >= state.currentTracklist.length) {
    nextIndex = 0;
  }

  playTrack(state.currentTracklist[nextIndex]);
}

function playPrevTrack() {
  if (!state.currentTracklist || state.currentTracklist.length === 0) return;
  
  if (dom.audioElement.currentTime > 3) {
    dom.audioElement.currentTime = 0;
    return;
  }

  const currentIndex = state.currentTracklist.findIndex(t => t.id === state.currentTrack?.id);
  let prevIndex = currentIndex - 1;
  if (prevIndex < 0) {
    prevIndex = state.currentTracklist.length - 1;
  }

  playTrack(state.currentTracklist[prevIndex]);
}

function updatePlayPauseButtons(playing) {
  dom.playIcon.style.display = playing ? 'none' : 'block';
  dom.pauseIcon.style.display = playing ? 'block' : 'none';
}

function highlightActivePlayingRow() {
  document.querySelectorAll('.track-row-capsule').forEach(row => {
    row.classList.remove('playing');
  });

  if (state.currentTrack && state.isPlaying) {
    const activeRow = document.getElementById(`trackRow-${state.currentTrack.id}`);
    if (activeRow) {
      activeRow.classList.add('playing');
    }
  }
}

// Прогресс-бар и время полного трека
dom.audioElement.addEventListener('timeupdate', () => {
  const cur = dom.audioElement.currentTime;
  const dur = dom.audioElement.duration || state.currentTrack?.duration || 180;
  
  state.currentTime = cur;
  state.duration = dur;

  const pct = (cur / dur) * 100;
  dom.timelineFill.style.width = `${pct}%`;
  dom.timelineThumb.style.left = `${pct}%`;
  
  dom.currentTimeLabel.textContent = formatTime(cur);
  dom.totalTimeLabel.textContent = formatTime(dur);
});

dom.audioElement.addEventListener('ended', () => {
  if (state.repeatMode === 'one') {
    dom.audioElement.currentTime = 0;
    dom.audioElement.play();
  } else {
    playNextTrack();
  }
});

dom.timelineTrack.addEventListener('click', (e) => {
  const rect = dom.timelineTrack.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const pct = Math.max(0, Math.min(1, clickX / rect.width));
  
  const dur = dom.audioElement.duration || state.currentTrack?.duration || 180;
  dom.audioElement.currentTime = pct * dur;
});

dom.volumeTrack.addEventListener('click', (e) => {
  const rect = dom.volumeTrack.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const pct = Math.max(0, Math.min(1, clickX / rect.width));
  setVolume(pct);
});

function setVolume(val) {
  state.volume = val;
  state.isMuted = val === 0;
  dom.audioElement.volume = val;
  localStorage.setItem('wavify_volume', val);
  updateVolumeUI(val);
}

function updateVolumeUI(val) {
  dom.volumeFill.style.width = `${val * 100}%`;
}

dom.btnVolumeMute.addEventListener('click', () => {
  if (state.isMuted) {
    setVolume(state.volume || 0.85);
  } else {
    dom.audioElement.volume = 0;
    state.isMuted = true;
    updateVolumeUI(0);
  }
});

// =========================================================
// 9. ИМПОРТ ТЕКСТОВ ПЕСЕН С GENIUS (GENIUS LYRICS)
// =========================================================
let currentLyricsAbortController = null;

async function openLyricsModal(track) {
  const targetTrack = track || state.currentTrack;
  if (!dom.lyricsModalBackdrop) return;

  dom.lyricsModalBackdrop.style.display = 'flex';

  if (!targetTrack) {
    dom.lyricsTrackThumb.style.display = 'none';
    dom.lyricsTrackTitle.textContent = state.settings.siteName || 'wavify';
    dom.lyricsTrackArtist.textContent = '';
    dom.lyricsLoading.style.display = 'none';
    dom.lyricsContent.innerHTML = `<div class="lyrics-empty-notice">${t('playTrackToViewLyrics')}</div>`;
    if (dom.lyricsGeniusLink) dom.lyricsGeniusLink.style.display = 'none';
    return;
  }

  // Заполняем метаданные трека
  dom.lyricsTrackTitle.textContent = targetTrack.title || t('unknownTitle');
  dom.lyricsTrackArtist.textContent = targetTrack.artist || t('unknownArtist');
  if (targetTrack.cover) {
    dom.lyricsTrackThumb.src = targetTrack.cover;
    dom.lyricsTrackThumb.style.display = 'block';
  } else {
    dom.lyricsTrackThumb.style.display = 'none';
  }

  // Показываем индикатор загрузки
  dom.lyricsLoading.style.display = 'flex';
  dom.lyricsContent.innerHTML = '';
  if (dom.lyricsGeniusLink) dom.lyricsGeniusLink.style.display = 'none';

  if (currentLyricsAbortController) {
    currentLyricsAbortController.abort();
  }
  currentLyricsAbortController = new AbortController();

  try {
    const queryUrl = `/api/lyrics?artist=${encodeURIComponent(targetTrack.artist)}&title=${encodeURIComponent(targetTrack.title)}`;
    const resp = await fetch(queryUrl, { signal: currentLyricsAbortController.signal });
    if (!resp.ok) throw new Error('Lyrics request failed');
    const data = await resp.json();

    dom.lyricsLoading.style.display = 'none';

    if (data.lyrics && data.lyrics.trim().length > 0) {
      dom.lyricsContent.innerHTML = formatLyricsText(data.lyrics);
      if (data.url && dom.lyricsGeniusLink) {
        dom.lyricsGeniusLink.href = data.url;
        dom.lyricsGeniusLink.style.display = 'inline-flex';
      }
    } else {
      dom.lyricsContent.innerHTML = `<div class="lyrics-empty-notice">${t('lyricsNotFound')}</div>`;
      if (dom.lyricsGeniusLink) dom.lyricsGeniusLink.style.display = 'none';
    }
  } catch (err) {
    if (err.name === 'AbortError') return;
    dom.lyricsLoading.style.display = 'none';
    dom.lyricsContent.innerHTML = `<div class="lyrics-empty-notice">${t('lyricsNotFound')}</div>`;
    if (dom.lyricsGeniusLink) dom.lyricsGeniusLink.style.display = 'none';
  }
}

function formatLyricsText(rawText) {
  const escaped = escapeHtml(rawText);
  // Выделяем блоки [Куплет], [Припев], [Chorus], [Verse] акцентными бейджами
  return escaped.replace(/(\[[^\]]+\])/g, '<span class="lyrics-section-header">$1</span>');
}

function closeLyricsModal() {
  if (dom.lyricsModalBackdrop) {
    dom.lyricsModalBackdrop.style.display = 'none';
  }
  if (currentLyricsAbortController) {
    currentLyricsAbortController.abort();
    currentLyricsAbortController = null;
  }
}

function setupLyricsModal() {
  if (dom.btnLyrics) {
    dom.btnLyrics.addEventListener('click', () => {
      openLyricsModal(state.currentTrack);
    });
  }

  if (dom.btnCloseLyrics) {
    dom.btnCloseLyrics.addEventListener('click', closeLyricsModal);
  }

  if (dom.lyricsModalBackdrop) {
    dom.lyricsModalBackdrop.addEventListener('click', (e) => {
      if (e.target === dom.lyricsModalBackdrop) {
        closeLyricsModal();
      }
    });
  }
}

// =========================================================
// 10. ПЛЕЙЛИСТЫ: СОЗДАНИЕ, ИЗМЕНЕНИЕ НАЗВАНИЯ И АВАТАРКИ
// =========================================================
let pendingModalAvatar = null;

function resetModalAvatar() {
  pendingModalAvatar = null;
  if (dom.modalAvatarImg) {
    dom.modalAvatarImg.src = '';
    dom.modalAvatarImg.style.display = 'none';
  }
  if (dom.modalAvatarPlaceholder) {
    dom.modalAvatarPlaceholder.style.display = 'flex';
  }
  if (dom.btnRemoveModalAvatar) {
    dom.btnRemoveModalAvatar.style.display = 'none';
  }
  if (dom.modalAvatarFileInput) {
    dom.modalAvatarFileInput.value = '';
  }
}

function resizeImageToDataUrl(file, maxSize = 400, quality = 0.85) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      return reject(new Error('File is not an image'));
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > maxSize) {
            height = Math.round((height * maxSize) / width);
            width = maxSize;
          }
        } else {
          if (height > maxSize) {
            width = Math.round((width * maxSize) / height);
            height = maxSize;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('Failed to decode image'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

function setupPlaylistButtonAndModals() {
  dom.btnNewPlaylist.addEventListener('click', (e) => {
    e.stopPropagation();
    const isVisible = dom.sidebarPlaylistPopout.classList.toggle('visible');
    dom.btnNewPlaylist.classList.toggle('active', isVisible);
  });

  document.addEventListener('click', (e) => {
    if (!dom.sidebarPlaylistPopout.contains(e.target) && e.target !== dom.btnNewPlaylist) {
      dom.sidebarPlaylistPopout.classList.remove('visible');
      dom.btnNewPlaylist.classList.remove('active');
    }
  });

  dom.btnSidebarPlaylistPill.addEventListener('click', () => {
    dom.sidebarPlaylistPopout.classList.remove('visible');
    dom.btnNewPlaylist.classList.remove('active');
    
    resetModalAvatar();
    dom.playlistModalBackdrop.style.display = 'flex';
    dom.newPlaylistNameInput.value = '';
    dom.newPlaylistNameInput.focus();
  });

  dom.btnCancelPlaylist.addEventListener('click', () => {
    dom.playlistModalBackdrop.style.display = 'none';
    resetModalAvatar();
  });

  dom.btnConfirmPlaylist.addEventListener('click', createNewPlaylist);
  dom.newPlaylistNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') createNewPlaylist();
    if (e.key === 'Escape') {
      dom.playlistModalBackdrop.style.display = 'none';
      resetModalAvatar();
    }
  });

  // Модалка: выбор аватарки
  if (dom.btnPickModalAvatar && dom.modalAvatarFileInput) {
    dom.btnPickModalAvatar.addEventListener('click', () => {
      dom.modalAvatarFileInput.click();
    });
  }

  if (dom.modalAvatarPreview && dom.modalAvatarFileInput) {
    dom.modalAvatarPreview.addEventListener('click', () => {
      dom.modalAvatarFileInput.click();
    });
  }

  if (dom.btnRemoveModalAvatar) {
    dom.btnRemoveModalAvatar.addEventListener('click', (e) => {
      e.stopPropagation();
      resetModalAvatar();
    });
  }

  if (dom.modalAvatarFileInput) {
    dom.modalAvatarFileInput.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      try {
        const dataUrl = await resizeImageToDataUrl(file, 400, 0.85);
        pendingModalAvatar = dataUrl;
        dom.modalAvatarImg.src = dataUrl;
        dom.modalAvatarImg.style.display = 'block';
        dom.modalAvatarPlaceholder.style.display = 'none';
        dom.btnRemoveModalAvatar.style.display = 'inline-flex';
      } catch (err) {
        console.error('Failed to process avatar file:', err);
      }
    });
  }

  dom.btnPlayerAddToPlaylist.addEventListener('click', () => {
    if (!state.currentTrack) return;
    
    if (state.playlists.length === 0) {
      const firstPl = {
        id: `pl-${Date.now()}`,
        title: state.settings.lang === 'ru' ? 'Мой плейлист' : 'My Playlist',
        author: 'You',
        cover: null,
        tracks: [state.currentTrack]
      };
      state.playlists.push(firstPl);
      savePlaylists();
      renderSidebar();
      showToast(t('addedToPlaylist'));
      return;
    }

    const targetPl = state.playlists[0];
    const exists = targetPl.tracks.some(t => t.id === state.currentTrack.id);
    if (!exists) {
      targetPl.tracks.push(state.currentTrack);
      savePlaylists();
    }
    showToast(t('addedToPlaylist'));
  });

  setupPlaylistEditing();
}

function setupPlaylistEditing() {
  // 1. Изменение названия в hero
  function startEditingTitle() {
    if (state.currentView !== 'playlist' || !state.activePlaylistId) return;
    const pl = state.playlists.find(p => p.id === state.activePlaylistId);
    if (!pl) return;

    dom.heroTitle.style.display = 'none';
    if (dom.btnEditPlaylistTitle) dom.btnEditPlaylistTitle.style.display = 'none';
    dom.heroTitleInput.style.display = 'block';
    dom.heroTitleInput.value = pl.title;
    dom.heroTitleInput.focus();
    dom.heroTitleInput.select();
  }

  function finishEditingTitle(save) {
    if (dom.heroTitleInput.style.display === 'none') return;
    const pl = state.playlists.find(p => p.id === state.activePlaylistId);
    if (!pl) {
      dom.heroTitleInput.style.display = 'none';
      dom.heroTitle.style.display = 'block';
      return;
    }

    if (save) {
      const newName = dom.heroTitleInput.value.trim();
      if (newName && newName !== pl.title) {
        pl.title = newName;
        savePlaylists();
        renderSidebar();
        showToast(t('titleUpdated'));
      }
    }

    dom.heroTitle.textContent = pl.title;
    dom.heroTitleInput.style.display = 'none';
    dom.heroTitle.style.display = 'block';
    if (state.currentView === 'playlist' && dom.btnEditPlaylistTitle) {
      dom.btnEditPlaylistTitle.style.display = 'flex';
    }
  }

  if (dom.btnEditPlaylistTitle) {
    dom.btnEditPlaylistTitle.addEventListener('click', (e) => {
      e.stopPropagation();
      startEditingTitle();
    });
  }

  if (dom.heroTitle) {
    dom.heroTitle.addEventListener('click', () => {
      if (state.currentView === 'playlist') {
        startEditingTitle();
      }
    });
  }

  if (dom.heroTitleInput) {
    dom.heroTitleInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        finishEditingTitle(true);
      } else if (e.key === 'Escape') {
        finishEditingTitle(false);
      }
    });

    dom.heroTitleInput.addEventListener('blur', () => {
      finishEditingTitle(true);
    });
  }

  // 2. Изменение аватарки (обложки) в hero
  if (dom.btnEditPlaylistCover && dom.playlistCoverFileInput) {
    dom.btnEditPlaylistCover.addEventListener('click', (e) => {
      e.stopPropagation();
      if (state.currentView === 'playlist' && state.activePlaylistId) {
        dom.playlistCoverFileInput.click();
      }
    });

    dom.playlistCoverFileInput.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      const pl = state.playlists.find(p => p.id === state.activePlaylistId);
      if (!pl) return;

      try {
        const dataUrl = await resizeImageToDataUrl(file, 400, 0.85);
        pl.cover = dataUrl;
        savePlaylists();
        renderSidebar();

        dom.heroCoverImg.src = dataUrl;
        dom.heroCoverImg.style.display = 'block';
        dom.heroCoverPlaceholder.style.display = 'none';

        showToast(t('avatarUpdated'));
      } catch (err) {
        console.error('Failed to update playlist cover:', err);
      } finally {
        dom.playlistCoverFileInput.value = '';
      }
    });
  }
}

function createNewPlaylist() {
  const name = dom.newPlaylistNameInput.value.trim();
  if (!name) return;

  const newPl = {
    id: `pl-${Date.now()}`,
    title: name,
    author: 'You',
    cover: pendingModalAvatar || null,
    tracks: []
  };

  state.playlists.push(newPl);
  savePlaylists();
  renderSidebar();

  dom.playlistModalBackdrop.style.display = 'none';
  resetModalAvatar();
  showToast(t('playlistCreated'));
  navigateTo('playlist', newPl.id);
}

// =========================================================
// 11. НАСТРОЙКИ
// =========================================================
function setupSettingsPopover() {
  dom.settingsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    dom.settingsPopover.classList.toggle('active');
  });

  document.addEventListener('click', (e) => {
    if (!dom.settingsPopover.contains(e.target) && e.target !== dom.settingsBtn) {
      dom.settingsPopover.classList.remove('active');
    }
  });

  dom.accentColorInput.addEventListener('input', (e) => {
    applyAccentColor(e.target.value);
  });

  dom.presetDots.forEach(dot => {
    dot.addEventListener('click', () => {
      applyAccentColor(dot.dataset.color);
    });
  });

  dom.siteNameInput.addEventListener('input', (e) => {
    applySiteName(e.target.value);
  });

  dom.langPills.forEach(pill => {
    pill.addEventListener('click', () => {
      applyLanguage(pill.dataset.lang);
    });
  });
}

// =========================================================
// 12. СЛУШАТЕЛИ СОБЫТИЙ
// =========================================================
function setupEventListeners() {
  dom.btnHistoryBack.addEventListener('click', handleHistoryBack);
  dom.btnHistoryForward.addEventListener('click', handleHistoryForward);

  dom.searchInput.addEventListener('input', handleSearchInput);
  dom.searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      clearTimeout(searchDebounceTimer);
      const query = dom.searchInput.value.trim();
      if (!query) return;
      if (state.currentView !== 'search') {
        navigateTo('search', query);
      } else {
        performSearch(query);
      }
    }
  });

  dom.searchClearBtn.addEventListener('click', () => {
    dom.searchInput.value = '';
    dom.searchClearBtn.style.display = 'none';
    if (currentSearchAbortController) {
      try { currentSearchAbortController.abort(); } catch (e) {}
    }
    state.lastSearchResults = null;
    navigateTo('home');
    dom.searchInput.focus();
  });

  dom.btnPlayPause.addEventListener('click', togglePlayPause);
  dom.btnNextTrack.addEventListener('click', playNextTrack);
  dom.btnPrevTrack.addEventListener('click', playPrevTrack);

  if (dom.btnResetAlbumFilter) {
    dom.btnResetAlbumFilter.addEventListener('click', resetAlbumFilter);
  }

  dom.btnRepeat.addEventListener('click', () => {
    if (state.repeatMode === 'off') {
      state.repeatMode = 'all';
      dom.btnRepeat.style.color = 'var(--accent-color)';
    } else if (state.repeatMode === 'all') {
      state.repeatMode = 'one';
      dom.btnRepeat.style.color = 'var(--accent-color)';
    } else {
      state.repeatMode = 'off';
      dom.btnRepeat.style.color = 'var(--text-muted)';
    }
  });

  setupLyricsModal();
  setupPlaylistButtonAndModals();
  setupSettingsPopover();

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeLyricsModal();
    }

    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
      return;
    }

    if (e.code === 'Space') {
      e.preventDefault();
      togglePlayPause();
    } else if (e.altKey && e.code === 'ArrowLeft') {
      e.preventDefault();
      handleHistoryBack();
    } else if (e.altKey && e.code === 'ArrowRight') {
      e.preventDefault();
      handleHistoryForward();
    } else if (e.ctrlKey && e.code === 'ArrowRight') {
      e.preventDefault();
      dom.audioElement.currentTime = Math.min(dom.audioElement.duration || 180, dom.audioElement.currentTime + 5);
    } else if (e.ctrlKey && e.code === 'ArrowLeft') {
      e.preventDefault();
      dom.audioElement.currentTime = Math.max(0, dom.audioElement.currentTime - 5);
    } else if (e.ctrlKey && e.code === 'ArrowUp') {
      e.preventDefault();
      setVolume(Math.min(1, state.volume + 0.05));
    } else if (e.ctrlKey && e.code === 'ArrowDown') {
      e.preventDefault();
      setVolume(Math.max(0, state.volume - 0.05));
    }
  });
}

function formatTime(seconds) {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, m => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[m]);
}

let toastTimeout = null;
function showToast(msg) {
  dom.toastText.textContent = msg;
  dom.toastNotification.classList.add('active');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    dom.toastNotification.classList.remove('active');
  }, 2200);
}

document.addEventListener('DOMContentLoaded', init);
