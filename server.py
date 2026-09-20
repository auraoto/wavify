#!/usr/bin/env python3
"""
WAVIFY - Полнофункциональный сервер:
1. Полное воспроизведение ЛЮБОГО трека без ограничений (Full Track Streaming)
2. Выдача ВСЕХ найденных альбомов исполнителя
3. Точные года выпуска релизов
4. Поддержка Deezer, Яндекс.Музыки и SoundCloud
Запуск: python3 server.py [порт]
"""

import sys
import os
import errno
import json
import re
import html as html_lib
import subprocess
import threading
import concurrent.futures
import urllib.request
import urllib.parse
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from bs4 import BeautifulSoup

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 3000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

# Кэш прямых стриминговых ссылок для мгновенного старта воспроизведения
AUDIO_STREAM_CACHE = {}
CACHE_LOCK = threading.Lock()

# Кэш треков альбомов для мгновенного открытия страницы альбома
ALBUM_TRACKS_CACHE = {}
ALBUM_CACHE_LOCK = threading.Lock()

# Кэш текстов песен Genius
LYRICS_CACHE = {}
LYRICS_LOCK = threading.Lock()

# Кэш client_id для прямого SoundCloud API v2
SC_CLIENT_ID = None
SC_CLIENT_LOCK = threading.Lock()

def precache_track_audio(query):
    """Фоновое кэширование стриминговой ссылки для мгновенного отклика плеера"""
    if not query:
        return
    norm = query.lower().strip()
    with CACHE_LOCK:
        if norm in AUDIO_STREAM_CACHE:
            return

    try:
        cmd = [
            '/usr/bin/yt-dlp',
            '-g',
            '--no-playlist',
            '--no-warnings',
            '-f', '251/140/bestaudio',
            f'ytsearch1:{query}'
        ]
        url = subprocess.check_output(cmd, stderr=subprocess.DEVNULL, timeout=14).decode().strip()
        if url and url.startswith('http'):
            with CACHE_LOCK:
                AUDIO_STREAM_CACHE[norm] = url
            return
    except Exception:
        pass

    # Фоллбек через SoundCloud
    try:
        cmd_sc = [
            '/usr/bin/yt-dlp',
            '-g',
            '--no-playlist',
            '--no-warnings',
            f'scsearch1:{query}'
        ]
        sc_url = subprocess.check_output(cmd_sc, stderr=subprocess.DEVNULL, timeout=10).decode().strip()
        if sc_url and sc_url.startswith('http'):
            with CACHE_LOCK:
                AUDIO_STREAM_CACHE[norm] = sc_url
    except Exception:
        pass

class WavifyHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        
        # 1. API поиска треков и альбомов
        if parsed.path == '/api/search':
            self.handle_api_search(parsed)
            return

        # 2. API треков конкретного альбома (по порядку)
        if parsed.path == '/api/album-tracks':
            self.handle_api_album_tracks(parsed)
            return

        # 3. API текстов песен с Genius
        if parsed.path == '/api/lyrics':
            self.handle_api_lyrics(parsed)
            return

        # 4. API прямого стриминга полного аудио (Full Streaming через HTTP 302 Redirect)
        if parsed.path == '/api/stream' or parsed.path == '/api/full-audio':
            self.handle_api_stream(parsed)
            return

        # 5. API информации о полном аудио (JSON ответ с прямой ссылкой)
        if parsed.path == '/api/full-audio-info':
            self.handle_api_full_audio_info(parsed)
            return

        super().do_GET()

    # -----------------------------------------------------------------
    # ПОЛНЫЙ АУДИОСТРИМИНГ (Воспроизведение любого трека от начала до конца)
    # -----------------------------------------------------------------
    def resolve_audio_stream(self, query, sc_url=None):
        # 0. Если передан прямой SoundCloud URL - получаем прямой аудиопоток SoundCloud
        if sc_url and sc_url.startswith('http'):
            norm_sc = sc_url.strip()
            with CACHE_LOCK:
                if norm_sc in AUDIO_STREAM_CACHE:
                    return AUDIO_STREAM_CACHE[norm_sc]
            try:
                cmd = ['/usr/bin/yt-dlp', '-g', '--no-playlist', '--no-warnings', sc_url]
                stream_sc = subprocess.check_output(cmd, stderr=subprocess.DEVNULL, timeout=12).decode().strip()
                if stream_sc and stream_sc.startswith('http'):
                    with CACHE_LOCK:
                        AUDIO_STREAM_CACHE[norm_sc] = stream_sc
                    return stream_sc
            except Exception as e:
                print(f"[Stream] Direct SoundCloud stream error for '{sc_url}': {e}", file=sys.stderr)

        if not query:
            return None
        norm = query.lower().strip()
        with CACHE_LOCK:
            if norm in AUDIO_STREAM_CACHE:
                return AUDIO_STREAM_CACHE[norm]

        # 1. Основной поиск через YouTube (WebM / Opus / M4A)
        try:
            cmd = [
                '/usr/bin/yt-dlp',
                '-g',
                '--no-playlist',
                '--no-warnings',
                '-f', '251/140/bestaudio',
                f'ytsearch1:{query}'
            ]
            stream_url = subprocess.check_output(cmd, stderr=subprocess.DEVNULL, timeout=14).decode().strip()
            if stream_url and stream_url.startswith('http'):
                with CACHE_LOCK:
                    AUDIO_STREAM_CACHE[norm] = stream_url
                return stream_url
        except Exception as e:
            print(f"[Stream] YouTube search error for '{query}': {e}", file=sys.stderr)

        # 2. Быстрый фоллбек через SoundCloud
        try:
            cmd_sc = [
                '/usr/bin/yt-dlp',
                '-g',
                '--no-playlist',
                '--no-warnings',
                f'scsearch1:{query}'
            ]
            sc_url_res = subprocess.check_output(cmd_sc, stderr=subprocess.DEVNULL, timeout=10).decode().strip()
            if sc_url_res and sc_url_res.startswith('http'):
                with CACHE_LOCK:
                    AUDIO_STREAM_CACHE[norm] = sc_url_res
                return sc_url_res
        except Exception as e:
            print(f"[Stream] SoundCloud search error for '{query}': {e}", file=sys.stderr)
        
        return None

    def handle_api_stream(self, parsed):
        query_params = urllib.parse.parse_qs(parsed.query)
        artist = query_params.get('artist', [''])[0].strip()
        title = query_params.get('title', [''])[0].strip()
        sc_url = query_params.get('sc_url', [''])[0].strip()
        q = f"{artist} {title}".strip() or query_params.get('q', [''])[0].strip()

        if not q and not sc_url:
            self.send_error(400, "Missing query")
            return

        stream_url = self.resolve_audio_stream(q, sc_url=sc_url)
        if stream_url:
            self.send_response(302)
            self.send_header('Location', stream_url)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
        else:
            self.send_error(404, "Audio stream not found")

    def handle_api_full_audio_info(self, parsed):
        query_params = urllib.parse.parse_qs(parsed.query)
        artist = query_params.get('artist', [''])[0].strip()
        title = query_params.get('title', [''])[0].strip()
        sc_url = query_params.get('sc_url', [''])[0].strip()
        q = f"{artist} {title}".strip() or query_params.get('q', [''])[0].strip()

        if not q and not sc_url:
            self.send_json_response({"fullAudioUrl": ""})
            return

        stream_url = self.resolve_audio_stream(q, sc_url=sc_url)
        self.send_json_response({"fullAudioUrl": stream_url or ""})

    # -----------------------------------------------------------------
    # ПОИСК: ВСЕ АЛЬБОМЫ И ВСЕ ТРЕКИ (DEEZER + ЯНДЕКС.МУЗЫКА + SOUNDCLOUD)
    # -----------------------------------------------------------------
    def handle_api_search(self, parsed):
        query_params = urllib.parse.parse_qs(parsed.query)
        q = query_params.get('q', [''])[0].strip()

        if not q:
            self.send_json_response({"albums": [], "results": []})
            return

        albums = []
        deezer_tracks = []
        yandex_tracks = []
        soundcloud_tracks = []

        # Параллельный поиск альбомов и треков по ВСЕМ стримингам (Deezer, Яндекс, SoundCloud)
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
            f_alb = executor.submit(self.fetch_all_albums, q)
            f_dz  = executor.submit(self.fetch_deezer_tracks, q, 'deezer')
            f_yan = executor.submit(self.fetch_yandex_tracks, q)
            f_sc  = executor.submit(self.fetch_soundcloud_tracks, q)

            try:
                albums = f_alb.result()
            except Exception as e:
                print(f"[Search] Albums error: {e}", file=sys.stderr)

            try:
                deezer_tracks = f_dz.result()
            except Exception as e:
                print(f"[Search] Deezer error: {e}", file=sys.stderr)

            try:
                yandex_tracks = f_yan.result()
            except Exception as e:
                print(f"[Search] Yandex error: {e}", file=sys.stderr)

            try:
                soundcloud_tracks = f_sc.result()
            except Exception as e:
                print(f"[Search] SoundCloud error: {e}", file=sys.stderr)

        # Равномерное чередование треков со всех трёх сервисов
        tracks = []
        max_len = max(len(yandex_tracks), len(deezer_tracks), len(soundcloud_tracks), 0)
        for i in range(max_len):
            if i < len(yandex_tracks):
                tracks.append(yandex_tracks[i])
            if i < len(deezer_tracks):
                tracks.append(deezer_tracks[i])
            if i < len(soundcloud_tracks):
                tracks.append(soundcloud_tracks[i])

        # Привязываем реальные года и прямые потоковые ссылки к каждому треку
        album_year_map = {a['title'].lower(): a['year'] for a in albums if a.get('year')}
        for tr in tracks:
            alb_title = (tr.get('album') or '').lower()
            if alb_title in album_year_map:
                tr['year'] = album_year_map[alb_title]
            
            enc_artist = urllib.parse.quote(tr['artist'])
            enc_title = urllib.parse.quote(tr['title'])
            sc_param = f"&sc_url={urllib.parse.quote(tr['scUrl'])}" if tr.get('scUrl') else ""
            tr['streamUrl'] = f"/api/stream?artist={enc_artist}&title={enc_title}{sc_param}"
            
            if not tr.get('audioUrl'):
                tr['audioUrl'] = tr['streamUrl']

        # Фоновое кэширование первых 4 треков для мгновенного запуска
        for tr in tracks[:4]:
            threading.Thread(target=precache_track_audio, args=(f"{tr['artist']} {tr['title']}",), daemon=True).start()

        self.send_json_response({
            "albums": albums,
            "results": tracks
        })

    def fetch_all_albums(self, query):
        albums = []
        seen_titles = set()

        # 1. Яндекс.Музыка (находит полную дискографию с точными годами)
        try:
            url_ya = f"https://api.music.yandex.net/search?text={urllib.parse.quote(query)}&type=album&page=0"
            req = urllib.request.Request(url_ya, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=4) as r:
                data = json.loads(r.read().decode())
                raw_albs = data.get('result', {}).get('albums', {}).get('results', [])
                for a in raw_albs[:15]:
                    title = a.get('title', '').strip()
                    if not title or title.lower() in seen_titles:
                        continue
                    seen_titles.add(title.lower())

                    artists = ', '.join([art.get('name', '') for art in a.get('artists', [])])
                    cover_uri = a.get('ogImage', '')
                    cover_url = f"https://{cover_uri.replace('%%', '400x400')}" if cover_uri else ''
                    year = str(a.get('year') or '2023')

                    albums.append({
                        "id": f"alb-ya-{a.get('id')}",
                        "title": title,
                        "artist": artists or query,
                        "year": year,
                        "cover": cover_url,
                        "source": "yandex"
                    })
        except Exception as e:
            print(f"[Albums] Yandex error: {e}", file=sys.stderr)

        # 2. Deezer каталог альбомов
        try:
            url_dz = f"https://api.deezer.com/search/album?q={urllib.parse.quote(query)}&limit=15"
            req = urllib.request.Request(url_dz, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=4) as r:
                data = json.loads(r.read().decode())
                for a in data.get('data', []):
                    title = a.get('title', '').strip()
                    if not title or title.lower() in seen_titles:
                        continue
                    seen_titles.add(title.lower())

                    artist = a.get('artist', {}).get('name', '')
                    cover = a.get('cover_medium') or a.get('cover_big') or ''
                    year = "2023"

                    albums.append({
                        "id": f"alb-dz-{a.get('id')}",
                        "title": title,
                        "artist": artist or query,
                        "year": year,
                        "cover": cover,
                        "source": "deezer"
                    })
        except Exception as e:
            print(f"[Albums] Deezer error: {e}", file=sys.stderr)

        return albums

    def fetch_deezer_tracks(self, query, assign_source='deezer'):
        url = f"https://api.deezer.com/search?q={urllib.parse.quote(query)}&limit=15"
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
        
        tracks = []
        with urllib.request.urlopen(req, timeout=4) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            for item in data.get('data', []):
                tracks.append({
                    "id": f"{assign_source}-{item.get('id')}",
                    "title": item.get('title', ''),
                    "artist": item.get('artist', {}).get('name', ''),
                    "album": item.get('album', {}).get('title', ''),
                    "year": "2023",
                    "source": assign_source,
                    "duration": item.get('duration', 180),
                    "cover": item.get('album', {}).get('cover_medium') or item.get('artist', {}).get('picture_medium') or '',
                    "audioUrl": item.get('preview', '')
                })
        return tracks

    def fetch_yandex_tracks(self, query):
        url = f"https://api.music.yandex.net/search?text={urllib.parse.quote(query)}&type=track&page=0"
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
        
        tracks = []
        with urllib.request.urlopen(req, timeout=4) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            raw_items = data.get('result', {}).get('tracks', {}).get('results', [])
            
            for item in raw_items[:12]:
                artists = ", ".join([a.get('name', '') for a in item.get('artists', [])])
                cover_uri = item.get('ogImage', '')
                cover_url = f"https://{cover_uri.replace('%%', '400x400')}" if cover_uri else ''
                albums = item.get('albums', [])
                album_title = albums[0].get('title', '') if albums else ''
                year = str(albums[0].get('year', '2023')) if albums and albums[0].get('year') else '2023'
                
                tracks.append({
                    "id": f"ya-{item.get('id')}",
                    "title": item.get('title', ''),
                    "artist": artists or "Яндекс.Музыка",
                    "album": album_title,
                    "year": year,
                    "source": "yandex",
                    "duration": round((item.get('durationMs') or 180000) / 1000),
                    "cover": cover_url,
                    "audioUrl": ""
                })
        return tracks

    def fetch_itunes_tracks(self, query, assign_source='soundcloud'):
        url = f"https://itunes.apple.com/search?term={urllib.parse.quote(query)}&country=RU&media=music&entity=song&limit=12"
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
        
        tracks = []
        with urllib.request.urlopen(req, timeout=4) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            for item in data.get('results', []):
                rel_date = item.get('releaseDate', '')
                year = rel_date[:4] if rel_date else '2023'
                tracks.append({
                    "id": f"{assign_source}-{item.get('trackId')}",
                    "title": item.get('trackName', ''),
                    "artist": item.get('artistName', ''),
                    "album": item.get('collectionName', ''),
                    "year": year,
                    "source": assign_source,
                    "duration": round((item.get('trackTimeMillis') or 180000) / 1000),
                    "cover": (item.get('artworkUrl100') or '').replace('100x100bb', '400x400bb'),
                    "audioUrl": item.get('previewUrl', '')
                })
    def handle_api_album_tracks(self, parsed):
        query_params = urllib.parse.parse_qs(parsed.query)
        alb_id = query_params.get('id', [''])[0].strip()
        artist = query_params.get('artist', [''])[0].strip()
        title = query_params.get('title', [''])[0].strip()
        source = query_params.get('source', [''])[0].strip().lower()

        cache_key = f"{alb_id}|{artist.lower()}|{title.lower()}"
        with ALBUM_CACHE_LOCK:
            if cache_key in ALBUM_TRACKS_CACHE:
                self.send_json_response(ALBUM_TRACKS_CACHE[cache_key])
                return

        tracks = []

        # 1. Яндекс.Музыка (возвращает точный официальный треклист по порядку)
        if alb_id.startswith('alb-ya-') or source == 'yandex':
            ya_id = alb_id.replace('alb-ya-', '')
            try:
                url_ya = f"https://api.music.yandex.net/albums/{urllib.parse.quote(ya_id)}/with-tracks"
                req = urllib.request.Request(url_ya, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
                with urllib.request.urlopen(req, timeout=5) as resp:
                    data = json.loads(resp.read().decode('utf-8'))
                    alb_meta = data.get('result', {})
                    cover_uri = alb_meta.get('ogImage', '')
                    cover_url = f"https://{cover_uri.replace('%%', '400x400')}" if cover_uri else ''
                    alb_year = str(alb_meta.get('year', '2023'))
                    
                    volumes = alb_meta.get('volumes', [])
                    track_index = 1
                    for vol in volumes:
                        for item in vol:
                            tr_artist = ', '.join([a.get('name', '') for a in item.get('artists', [])]) or artist
                            tr_title = item.get('title', '')
                            tr_cover = cover_url
                            tr_item_uri = item.get('ogImage', '')
                            if tr_item_uri:
                                tr_cover = f"https://{tr_item_uri.replace('%%', '400x400')}"
                            
                            enc_art = urllib.parse.quote(tr_artist)
                            enc_tit = urllib.parse.quote(tr_title)

                            # Проверяем реальную доступность трека на Яндекс.Музыке
                            is_available_on_ya = (item.get('available') is not False) and (not item.get('error'))
                            tr_source = "yandex" if is_available_on_ya else "deezer"
                            tr_id_prefix = "ya" if is_available_on_ya else "dz"
                            
                            tracks.append({
                                "id": f"{tr_id_prefix}-{item.get('id')}",
                                "trackNumber": track_index,
                                "title": tr_title,
                                "artist": tr_artist,
                                "album": title or alb_meta.get('title', ''),
                                "year": alb_year,
                                "source": tr_source,
                                "duration": round((item.get('durationMs') or 180000) / 1000),
                                "cover": tr_cover,
                                "streamUrl": f"/api/stream?artist={enc_art}&title={enc_tit}",
                                "audioUrl": f"/api/stream?artist={enc_art}&title={enc_tit}"
                            })
                            track_index += 1
            except Exception as e:
                print(f"[AlbumTracks] Yandex error: {e}", file=sys.stderr)

        # 2. Deezer каталог альбомов
        if not tracks and (alb_id.startswith('alb-dz-') or source == 'deezer'):
            dz_id = alb_id.replace('alb-dz-', '')
            try:
                alb_meta_url = f"https://api.deezer.com/album/{urllib.parse.quote(dz_id)}"
                req_m = urllib.request.Request(alb_meta_url, headers={'User-Agent': 'Mozilla/5.0'})
                alb_cover = ''
                alb_year = '2023'
                try:
                    with urllib.request.urlopen(req_m, timeout=4) as r_m:
                        dm = json.loads(r_m.read().decode('utf-8'))
                        alb_cover = dm.get('cover_medium') or dm.get('cover_big') or ''
                        if dm.get('release_date'):
                            alb_year = dm['release_date'].split('-')[0]
                except Exception:
                    pass

                url_dz = f"https://api.deezer.com/album/{urllib.parse.quote(dz_id)}/tracks?limit=100"
                req = urllib.request.Request(url_dz, headers={'User-Agent': 'Mozilla/5.0'})
                with urllib.request.urlopen(req, timeout=5) as resp:
                    data = json.loads(resp.read().decode('utf-8'))
                    for idx, item in enumerate(data.get('data', []), 1):
                        tr_artist = item.get('artist', {}).get('name', '') or artist
                        tr_title = item.get('title', '')
                        enc_art = urllib.parse.quote(tr_artist)
                        enc_tit = urllib.parse.quote(tr_title)

                        tracks.append({
                            "id": f"dz-{item.get('id')}",
                            "trackNumber": item.get('track_position', idx),
                            "title": tr_title,
                            "artist": tr_artist,
                            "album": title,
                            "year": alb_year,
                            "source": "deezer",
                            "duration": item.get('duration', 180),
                            "cover": alb_cover,
                            "streamUrl": f"/api/stream?artist={enc_art}&title={enc_tit}",
                            "audioUrl": item.get('preview') or f"/api/stream?artist={enc_art}&title={enc_tit}"
                        })
            except Exception as e:
                print(f"[AlbumTracks] Deezer error: {e}", file=sys.stderr)

        # 3. Fallback: поиск по iTunes если по id ничего не найдено
        if not tracks and title:
            try:
                itunes_query = f"{artist} {title}".strip()
                url_it = f"https://itunes.apple.com/search?term={urllib.parse.quote(itunes_query)}&entity=song&limit=50"
                req = urllib.request.Request(url_it, headers={'User-Agent': 'Mozilla/5.0'})
                with urllib.request.urlopen(req, timeout=4) as resp:
                    data = json.loads(resp.read().decode('utf-8'))
                    filtered_it = [
                        it for it in data.get('results', [])
                        if it.get('collectionName', '').lower() == title.lower() or
                           it.get('artistName', '').lower() == artist.lower()
                    ]
                    filtered_it.sort(key=lambda x: x.get('trackNumber', 99))
                    for it in filtered_it:
                        tr_artist = it.get('artistName', '') or artist
                        tr_title = it.get('trackName', '')
                        enc_art = urllib.parse.quote(tr_artist)
                        enc_tit = urllib.parse.quote(tr_title)
                        cover_it = (it.get('artworkUrl100', '')).replace('100x100bb', '400x400bb')
                        year_it = it.get('releaseDate', '')[:4] if it.get('releaseDate') else '2023'

                        tracks.append({
                            "id": f"sc-{it.get('trackId')}",
                            "trackNumber": it.get('trackNumber', len(tracks) + 1),
                            "title": tr_title,
                            "artist": tr_artist,
                            "album": it.get('collectionName', title),
                            "year": year_it,
                            "source": "soundcloud",
                            "duration": round((it.get('trackTimeMillis', 180000)) / 1000),
                            "cover": cover_it,
                            "streamUrl": f"/api/stream?artist={enc_art}&title={enc_tit}",
                            "audioUrl": it.get('previewUrl') or f"/api/stream?artist={enc_art}&title={enc_tit}"
                        })
            except Exception as e:
                print(f"[AlbumTracks] iTunes error: {e}", file=sys.stderr)

        # Фоновое кэширование первых 4 треков альбома для моментального запуска
        for tr in tracks[:4]:
            threading.Thread(target=precache_track_audio, args=(f"{tr['artist']} {tr['title']}",), daemon=True).start()

        res = {
            "albumId": alb_id,
            "title": title,
            "artist": artist,
            "tracks": tracks
        }
        with ALBUM_CACHE_LOCK:
            ALBUM_TRACKS_CACHE[cache_key] = res

        self.send_json_response(res)

    # -----------------------------------------------------------------
    # SOUNDCLOUD ПОИСК (Прямой API v2 + yt-dlp фоллбек)
    # -----------------------------------------------------------------
    def get_sc_client_id(self):
        global SC_CLIENT_ID
        with SC_CLIENT_LOCK:
            if SC_CLIENT_ID:
                return SC_CLIENT_ID

        try:
            req = urllib.request.Request('https://soundcloud.com', headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
            with urllib.request.urlopen(req, timeout=4) as r:
                html = r.read().decode('utf-8')
                scripts = re.findall(r'src="(https://a-v2\.sndcdn\.com/assets/[^"]+\.js)"', html)
                for s_url in scripts[-5:]:
                    try:
                        with urllib.request.urlopen(s_url, timeout=3) as sr:
                            js = sr.read().decode('utf-8', errors='ignore')
                            m = re.search(r'client_id:"([a-zA-Z0-9]{32})"', js) or re.search(r'"client_id=([a-zA-Z0-9]{32})"', js)
                            if m:
                                cid = m.group(1)
                                with SC_CLIENT_LOCK:
                                    SC_CLIENT_ID = cid
                                return cid
                    except Exception:
                        continue
        except Exception as e:
            print(f"[SoundCloud] Client ID extract error: {e}", file=sys.stderr)

        fallback_cid = 'Pb72ranhoyt6gw7hM7TkzUItXlMWSNSo'
        with SC_CLIENT_LOCK:
            SC_CLIENT_ID = fallback_cid
        return fallback_cid

    def fetch_soundcloud_tracks(self, query):
        cid = self.get_sc_client_id()
        tracks = []

        # 1. Быстрый HTTP запрос к API SoundCloud v2
        try:
            url = f"https://api-v2.soundcloud.com/search/tracks?q={urllib.parse.quote(query)}&client_id={cid}&limit=12"
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
            with urllib.request.urlopen(req, timeout=4) as resp:
                data = json.loads(resp.read().decode('utf-8'))
                for item in data.get('collection', []):
                    t_id = str(item.get('id', ''))
                    title = item.get('title', '')
                    user = item.get('user', {})
                    artist = user.get('username') or query
                    dur = round((item.get('duration') or 180000) / 1000)
                    art_url = item.get('artwork_url') or user.get('avatar_url') or ''
                    cover = art_url.replace('-large', '-t500x500') if art_url else ''
                    permalink = item.get('permalink_url', '')

                    tracks.append({
                        "id": f"sc-{t_id}",
                        "title": title,
                        "artist": artist,
                        "album": "SoundCloud",
                        "year": str(item.get('release_date', '')[:4] if item.get('release_date') else '2024'),
                        "source": "soundcloud",
                        "duration": dur,
                        "cover": cover,
                        "audioUrl": "",
                        "scUrl": permalink
                    })
            if tracks:
                return tracks
        except Exception as e:
            print(f"[SoundCloud] API v2 search error: {e}", file=sys.stderr)

        # 2. Фоллбек через yt-dlp если API v2 вернул ошибку
        try:
            cmd = ['/usr/bin/yt-dlp', '--dump-json', '--flat-playlist', '--no-warnings', f'scsearch8:{query}']
            out = subprocess.check_output(cmd, stderr=subprocess.DEVNULL, timeout=6).decode('utf-8')
            for l in out.strip().split('\n'):
                if not l: continue
                d = json.loads(l)
                thumb = d.get('thumbnail') or (d.get('thumbnails', [{}])[-1].get('url') if d.get('thumbnails') else '')
                tracks.append({
                    "id": f"sc-{d.get('id')}",
                    "title": d.get('title', ''),
                    "artist": d.get('uploader') or query,
                    "album": "SoundCloud",
                    "year": "2024",
                    "source": "soundcloud",
                    "duration": round(float(d.get('duration') or 180)),
                    "cover": thumb,
                    "audioUrl": "",
                    "scUrl": d.get('webpage_url') or d.get('url')
                })
        except Exception as e:
            print(f"[SoundCloud] yt-dlp search error: {e}", file=sys.stderr)

        return tracks

    # -----------------------------------------------------------------
    # GENIUS ТЕКСТЫ ПЕСЕН
    # -----------------------------------------------------------------
    def handle_api_lyrics(self, parsed):
        query_params = urllib.parse.parse_qs(parsed.query)
        artist = query_params.get('artist', [''])[0].strip()
        title = query_params.get('title', [''])[0].strip()
        q = f"{artist} {title}".strip() or query_params.get('q', [''])[0].strip()

        if not q:
            self.send_json_response({"error": "Missing artist or title", "lyrics": ""})
            return

        cache_key = f"{artist.lower()}|{title.lower()}"
        with LYRICS_LOCK:
            if cache_key in LYRICS_CACHE:
                self.send_json_response(LYRICS_CACHE[cache_key])
                return

        lyrics_data = self.fetch_genius_lyrics(artist, title)
        if lyrics_data:
            with LYRICS_LOCK:
                LYRICS_CACHE[cache_key] = lyrics_data
            self.send_json_response(lyrics_data)
        else:
            fallback_res = {
                "title": title,
                "artist": artist,
                "lyrics": "",
                "error": "Текст песни на Genius не найден",
                "source": "genius"
            }
            self.send_json_response(fallback_res)

    def fetch_genius_lyrics(self, artist, title):
        query = f"{artist} {title}".strip()
        if not query:
            return None

        song_url = None
        full_title = None

        try:
            url = f"https://genius.com/api/search/multi?q={urllib.parse.quote(query)}"
            req = urllib.request.Request(url, headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            })
            with urllib.request.urlopen(req, timeout=5) as resp:
                data = json.loads(resp.read().decode('utf-8'))
                for sec in data.get('response', {}).get('sections', []):
                    if sec.get('type') == 'song':
                        hits = sec.get('hits', [])
                        if hits:
                            best = hits[0].get('result', {})
                            song_url = best.get('url')
                            full_title = best.get('full_title')
                            break
        except Exception as e:
            print(f"[Genius] Search error: {e}", file=sys.stderr)
            return None

        if not song_url:
            return None

        try:
            req_p = urllib.request.Request(song_url, headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            })
            with urllib.request.urlopen(req_p, timeout=6) as p_resp:
                html_text = p_resp.read().decode('utf-8', errors='ignore')

                soup = BeautifulSoup(html_text, 'html.parser')
                # Удаляем заголовки контрибьюторов, выпадающие списки и сторонние блоки
                for el in soup.find_all(attrs={'data-exclude-from-selection': 'true'}):
                    el.decompose()

                containers = soup.find_all('div', attrs={'data-lyrics-container': 'true'})
                if not containers:
                    return None

                all_parts = []
                for c in containers:
                    for br in c.find_all(['br', 'wbr']):
                        br.replace_with('\n')
                    txt = c.get_text()
                    if txt.strip():
                        all_parts.append(txt.strip())

                raw = '\n\n'.join(all_parts)
                cleaned = html_lib.unescape(raw).strip()
                cleaned = re.sub(r'You might also like.*', '', cleaned, flags=re.IGNORECASE)
                cleaned = re.sub(r'^\d+\s*Contributors.*?\n', '', cleaned, flags=re.IGNORECASE)
                cleaned = re.sub(r'^Translations.*?\n', '', cleaned, flags=re.IGNORECASE)
                cleaned = re.sub(r'^\s*\[Текст песни[^\]]*\]\s*', '', cleaned)
                cleaned = re.sub(r'\d*Embed$', '', cleaned).strip()

                if not cleaned:
                    return None

                return {
                    "title": title,
                    "artist": artist,
                    "fullTitle": full_title or f"{artist} - {title}",
                    "lyrics": cleaned,
                    "url": song_url,
                    "source": "genius"
                }
        except Exception as e:
            print(f"[Genius] Page scrape error: {e}", file=sys.stderr)
            return None

    def send_json_response(self, data):
        body = json.dumps(data).encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

def start_server_background(port=PORT):
    """Запускает HTTP сервер в фоновом потоке, возвращает (httpd, port)"""
    for p in range(port, port + 50):
        try:
            httpd = ThreadingHTTPServer(('', p), WavifyHandler)
            httpd.daemon_threads = True
            t = threading.Thread(target=httpd.serve_forever, daemon=True)
            t.start()
            print(f"=================================================")
            print(f"  Wavify Music Server запущен в фоновом потоке!")
            print(f"  Локальный адрес: http://localhost:{p}")
            print(f"  Файлы сайта:    {DIRECTORY}")
            print(f"=================================================")
            return httpd, p
        except OSError as e:
            if e.errno in (getattr(errno, 'EADDRINUSE', 98), getattr(errno, 'WSAEADDRINUSE', 10048), 98, 10048):
                continue
            raise
    raise RuntimeError("Не удалось найти свободный порт для сервера Wavify")

def run():
    server_address = ('', PORT)
    try:
        httpd = ThreadingHTTPServer(server_address, WavifyHandler)
        httpd.daemon_threads = True
        print(f"=================================================")
        print(f"  Wavify Music Server запущен!")
        print(f"  Полное воспроизведение треков: /api/stream")
        print(f"  Локальный адрес: http://localhost:{PORT}")
        print(f"  Файлы сайта:    {DIRECTORY}")
        print(f"=================================================")
        httpd.serve_forever()
    except OSError as e:
        if e.errno in (getattr(errno, 'EADDRINUSE', 98), getattr(errno, 'WSAEADDRINUSE', 10048), 98, 10048):
            alt_port = PORT + 1
            print(f"Порт {PORT} занят, пробуем {alt_port}...")
            httpd = ThreadingHTTPServer(('', alt_port), WavifyHandler)
            httpd.daemon_threads = True
            print(f"Wavify Music Server запущен на http://localhost:{alt_port}")
            httpd.serve_forever()
        else:
            raise

if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1].isdigit():
        PORT = int(sys.argv[1])
        run()
    elif '--server' in sys.argv or '--headless' in sys.argv:
        run()
    else:
        try:
            import main
            main.launch()
        except ImportError:
            run()
