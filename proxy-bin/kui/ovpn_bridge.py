#!/usr/bin/env python3
"""Host TCP 127.0.0.1:port <-> SOCKS5 in a netns, bound to tun0."""
from __future__ import annotations

import os
import select
import socket
import struct
import threading

SO_BINDTODEVICE = 25


def splice(a: socket.socket, b: socket.socket) -> None:
    sockets = [a, b]
    try:
        while True:
            r, _, _ = select.select(sockets, [], [], 120)
            if not r:
                break
            for s in r:
                other = b if s is a else a
                data = s.recv(65536)
                if not data:
                    return
                other.sendall(data)
    except OSError:
        return
    finally:
        for s in (a, b):
            try:
                s.shutdown(socket.SHUT_RDWR)
            except OSError:
                pass
            try:
                s.close()
            except OSError:
                pass


def socks5_unix(sock_path: str, device: str) -> None:
    try:
        os.unlink(sock_path)
    except FileNotFoundError:
        pass
    srv = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    srv.bind(sock_path)
    srv.listen(64)
    os.chmod(sock_path, 0o666)
    while True:
        c, _ = srv.accept()
        threading.Thread(target=handle_socks, args=(c, device), daemon=True).start()


def handle_socks(c: socket.socket, device: str) -> None:
    try:
        hello = c.recv(16)
        if len(hello) < 2 or hello[0] != 5:
            return
        c.sendall(b"\x05\x00")
        req = c.recv(4)
        if len(req) < 4 or req[1] != 1:
            c.sendall(b"\x05\x07\x00\x01\x00\x00\x00\x00\x00\x00")
            return
        atyp = req[3]
        if atyp == 1:
            raw = c.recv(4)
            host = socket.inet_ntoa(raw)
        elif atyp == 3:
            n = c.recv(1)[0]
            host = c.recv(n).decode()
        else:
            c.sendall(b"\x05\x08\x00\x01\x00\x00\x00\x00\x00\x00")
            return
        port = struct.unpack("!H", c.recv(2))[0]
        up = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        up.setsockopt(socket.SOL_SOCKET, SO_BINDTODEVICE, device.encode() + b"\0")
        up.settimeout(15)
        up.connect((host, port))
        c.sendall(b"\x05\x00\x00\x01\x00\x00\x00\x00\x00\x00")
        splice(c, up)
    except Exception:
        try:
            c.sendall(b"\x05\x01\x00\x01\x00\x00\x00\x00\x00\x00")
        except OSError:
            pass
        try:
            c.close()
        except OSError:
            pass


def host_forward(port: int, sock_path: str) -> None:
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind(("127.0.0.1", port))
    srv.listen(64)
    while True:
        c, _ = srv.accept()
        threading.Thread(target=forward_one, args=(c, sock_path), daemon=True).start()


def forward_one(c: socket.socket, sock_path: str) -> None:
    try:
        u = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        u.settimeout(5)
        u.connect(sock_path)
        splice(c, u)
    except Exception:
        try:
            c.close()
        except OSError:
            pass


if __name__ == "__main__":
    import sys

    mode = sys.argv[1]
    if mode == "ns-socks":
        socks5_unix(sys.argv[2], sys.argv[3])
    elif mode == "host-fwd":
        host_forward(int(sys.argv[2]), sys.argv[3])
    else:
        raise SystemExit("ns-socks|host-fwd")
