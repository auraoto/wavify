#!/usr/bin/env python3
"""
Wavify Desktop App via pywebview
Полноформатный плеер с воспроизведением треков и современным интерфейсом
"""

import os
import sys
import time
import urllib.request
import webview
import server

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
os.chdir(BASE_DIR)

def is_server_running(url, timeout=0.8):
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Wavify-Check'})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status == 200
    except Exception:
        return False

def launch():
    # 1. Проверяем, запущен ли уже локальный сервер Wavify на порту 3000
    target_port = 3000
    httpd = None

    if is_server_running(f"http://localhost:{target_port}/index.html"):
        print(f"Обнаружен работающий сервер Wavify на порту {target_port}")
        actual_port = target_port
    else:
        # Запускаем встроенный локальный сервер в фоновом потоке
        httpd, actual_port = server.start_server_background(target_port)

    # 2. Настраиваем директорию постоянного хранилища (localStorage, cookies)
    storage_dir = os.path.expanduser("~/.local/share/wavify")
    os.makedirs(storage_dir, exist_ok=True)

    icon_path = os.path.join(BASE_DIR, "assets", "deezer.png")
    if not os.path.exists(icon_path):
        icon_path = None

    # 3. Создаем окно приложения
    app_url = f"http://localhost:{actual_port}/index.html"
    window = webview.create_window(
        title="Wavify",
        url=app_url,
        width=1280,
        height=820,
        min_size=(960, 600),
        background_color="#0E0E10",
        text_select=False,
        confirm_close=False,
        easy_drag=False
    )

    print("Запуск окна Wavify через pywebview...")

    # 4. Запускаем нативный GUI цикл
    try:
        webview.start(
            private_mode=False,
            storage_path=storage_dir,
            icon=icon_path,
            debug=False
        )
    finally:
        if httpd:
            try:
                httpd.shutdown()
            except Exception:
                pass
        print("Приложение Wavify закрыто.")

if __name__ == '__main__':
    launch()
