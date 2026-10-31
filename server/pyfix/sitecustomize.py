import socket

_original_getaddrinfo = socket.getaddrinfo


def ipv4_first(host, port, family=0, type=0, proto=0, flags=0):
    results = _original_getaddrinfo(host, port, family, type, proto, flags)
    results.sort(key=lambda item: 0 if item[0] == socket.AF_INET else 1)
    return results


socket.getaddrinfo = ipv4_first
