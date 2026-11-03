import base64
from concurrent.futures import ThreadPoolExecutor
import importlib.util
import json
from pathlib import Path
import tempfile
import threading
import unittest
import urllib.request
import urllib.error

spec = importlib.util.spec_from_file_location('quest_server', Path(__file__).resolve().parents[1] / 'server.py')
server_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server_module)


class StoreTests(unittest.TestCase):
    def test_durability_and_revision_conflict(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'test.sqlite3'
            store = server_module.Store(path)
            snapshot = store.read()
            snapshot['state']['rewards'][0]['name'] = 'Saved reward'
            self.assertEqual(store.write(1, snapshot['state'])['revision'], 2)
            self.assertIsNone(store.write(1, snapshot['state']))
            self.assertEqual(server_module.Store(path).read()['state']['rewards'][0]['name'], 'Saved reward')

    def test_concurrent_clients_only_one_revision_wins(self):
        with tempfile.TemporaryDirectory() as temp:
            store = server_module.Store(Path(temp) / 'test.sqlite3')
            original = store.read()
            with ThreadPoolExecutor(max_workers=2) as pool:
                writes = list(pool.map(lambda _: store.write(1, original['state']), range(2)))
            self.assertEqual(sum(v is not None for v in writes), 1)
            self.assertEqual(store.read()['revision'], 2)

    def test_invalid_data_cannot_replace_existing_state(self):
        with tempfile.TemporaryDirectory() as temp:
            store = server_module.Store(Path(temp) / 'test.sqlite3')
            with self.assertRaises(ValueError):
                store.write(1, dict(version=1, tasks=[None], ledger=[], rewards=[], sessions=[]))
            self.assertEqual(store.read()['revision'], 1)

    def test_category_registry_survives_restart_and_deleted_defaults_stay_deleted(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'test.sqlite3'
            store = server_module.Store(path)
            snapshot = store.read()
            snapshot['state']['categories'] = ['Personal', 'Engineering']
            store.write(snapshot['revision'], snapshot['state'])
            self.assertEqual(server_module.Store(path).read()['state']['categories'], ['Personal', 'Engineering'])
            bad = store.read()['state']
            bad['categories'] = ['Work', 'work']
            with self.assertRaises(ValueError):
                store.write(2, bad)
            self.assertEqual(store.read()['revision'], 2)

    def test_legacy_state_import_gains_category_registry(self):
        legacy = server_module.initial_state()
        del legacy['categories']
        migrated = server_module.validate(legacy)
        self.assertIn('Work', migrated['categories'])


class ApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.server = server_module.create_server(port=0, db=Path(cls.temp.name) / 'test.sqlite3')
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.url = 'http://127.0.0.1:%s' % cls.server.server_port
        cls.client = urllib.request.build_opener(urllib.request.ProxyHandler({}))

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()
        cls.temp.cleanup()

    def setUp(self):
        self.server.password = None

    def request(self, path, method='GET', data=None, headers=None):
        req = urllib.request.Request(self.url + path, method=method, data=data, headers=headers or {})
        try:
            response = self.client.open(req, timeout=3)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            return response.code, response.headers, response.read()

    def test_two_clients_share_state_and_stale_save_is_rejected(self):
        code, headers, body = self.request('/api/state')
        original = json.loads(body)
        self.assertEqual(code, 200)
        original['state']['rewards'][0]['name'] = 'Across devices'
        write_headers = {'Content-Type': 'application/json', 'If-Match': headers['ETag'], 'Origin': self.url}
        result = self.request('/api/state', 'PUT', json.dumps(original['state']).encode(), write_headers)
        self.assertEqual(result[0], 200)
        self.assertEqual(self.request('/api/state', 'PUT', json.dumps(original['state']).encode(), write_headers)[0], 409)
        new = self.request('/api/state')
        self.assertEqual(json.loads(new[2])['state']['rewards'][0]['name'], 'Across devices')
        self.assertEqual(self.request('/api/state', headers={'If-None-Match': new[1]['ETag']})[0], 304)

    def test_assets_config_and_no_database_or_directory_exposure(self):
        self.assertEqual(self.request('/')[0], 200)
        self.assertIn(b'enabled: true', self.request('/server-config.js')[2])
        for path in ['/data/test.sqlite3', '/server.py', '/../server.py', '/.git/config']:
            self.assertEqual(self.request(path)[0], 404)
        self.assertEqual(json.loads(self.request('/api/health')[2])['storage'], 'sqlite')

    def test_origin_content_type_revision_and_body_checks(self):
        data = json.dumps(self.server.store.read()['state']).encode()
        headers = {'Content-Type': 'application/json', 'If-Match': '"1"', 'Origin': 'http://untrusted.example'}
        self.assertEqual(self.request('/api/state', 'PUT', data, headers)[0], 403)
        self.assertEqual(self.request('/api/state', 'PUT', data, {'Content-Type': 'text/plain'})[0], 415)
        self.assertEqual(self.request('/api/state', 'PUT', data, {'Content-Type': 'application/json'})[0], 428)
        self.assertEqual(self.request('/api/state', 'PUT', b'{broken', {'Content-Type': 'application/json', 'If-Match': '"1"'})[0], 400)
        self.assertEqual(self.request('/', headers={'Host': 'untrusted.example'})[0], 403)

    def test_optional_password_is_required_for_page_and_api(self):
        self.server.password = 'test-only-password'
        for path in ['/', '/api/state']:
            self.assertEqual(self.request(path)[0], 401)
            token = base64.b64encode(b'quest:test-only-password').decode()
            self.assertEqual(self.request(path, headers={'Authorization': 'Basic ' + token})[0], 200)


if __name__ == '__main__':
    unittest.main()
