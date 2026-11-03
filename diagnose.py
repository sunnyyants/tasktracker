#!/usr/bin/env python3
"""Read-only checks. Run on the HOST Mac mini, not the other laptop."""
import socket
import subprocess
import sys
import urllib.error
import urllib.request
import shutil

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
print('Run this script on the Mac mini hosting QUEST//OS.')
print('Host:', socket.gethostname())
addresses = []
if sys.platform == 'darwin':
    for interface in ['en0', 'en1', 'en2', 'en3']:
        result = subprocess.run(['/usr/sbin/ipconfig', 'getifaddr', interface], capture_output=True, text=True)
        ip = result.stdout.strip()
        if result.returncode == 0 and ip and ip not in addresses:
            addresses.append(ip)
if not addresses:
    try:
        addresses = list({a[4][0] for a in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET) if not a[4][0].startswith('127.')})
    except OSError:
        pass
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
for host in ['127.0.0.1'] + addresses:
    url = 'http://%s:%s/' % (host, port)
    try:
        with opener.open(url, timeout=3) as response:
            print('OK:   ', url, 'HTTP', response.status)
    except urllib.error.HTTPError as error:
        print('REACHED:', url, 'HTTP', error.code, '(401 means optional app password required)' if error.code == 401 else '')
    except (OSError, urllib.error.URLError) as error:
        print('FAILED:', url, str(error))
if shutil.which('lsof'):
    print('\nListening process (look for *:8080 or 0.0.0.0:8080, not only 127.0.0.1:8080):')
    subprocess.run(['lsof', '-nP', '-iTCP:%s' % port, '-sTCP:LISTEN'])
print('\nLaptop URLs:', ', '.join('http://%s:%s/' % (ip, port) for ip in addresses) or 'Check this Mac’s network settings for its LAN IP.')
print('Localhost OK but LAN IP fails: restart with --host 0.0.0.0.')
print('Both work on mini but laptop fails: verify mini IP, same non-guest LAN, macOS Firewall Python incoming permission, and VPN/router isolation.')
print('No password is required unless server.py was started with --password. Do not disable the firewall globally.')
