import json
import urllib.request
from google.oauth2.service_account import Credentials
from google.auth.transport.requests import Request

scopes = ['https://www.googleapis.com/auth/drive']
creds = Credentials.from_service_account_file('credentials.json', scopes=scopes)
creds.refresh(Request())
token = creds.token

with open('Informe_Semanal_Atletas_KLEOS.txt', 'r', encoding='utf-8') as f:
    file_content = f.read()

# Multipart upload to Google Drive v3
boundary = '-------314159265358979323846'
delimiter = f'\r\n--{boundary}\r\n'
close_delim = f'\r\n--{boundary}--'

metadata = {
    'name': 'Informe_Semanal_Atletas_KLEOS.txt',
    'mimeType': 'text/plain'
}

multipart_body = (
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    json.dumps(metadata) +
    delimiter +
    'Content-Type: text/plain; charset=UTF-8\r\n\r\n' +
    file_content +
    close_delim
).encode('utf-8')

upload_req = urllib.request.Request(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
    data=multipart_body,
    headers={
        'Authorization': f'Bearer {token}',
        'Content-Type': f'multipart/related; boundary={boundary}'
    }
)

with urllib.request.urlopen(upload_req) as resp:
    created_file = json.loads(resp.read().decode('utf-8'))
    file_id = created_file['id']
    print(f'File created successfully! ID: {file_id}')

# Share with user (isaic.delalvarado@gmail.com) as writer and send notification
perm_data = {
    'role': 'writer',
    'type': 'user',
    'emailAddress': 'isaic.delalvarado@gmail.com'
}

perm_req = urllib.request.Request(
    f'https://www.googleapis.com/drive/v3/files/{file_id}/permissions?sendNotificationEmail=true',
    data=json.dumps(perm_data).encode('utf-8'),
    headers={
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json'
    }
)

with urllib.request.urlopen(perm_req) as resp:
    perm_res = json.loads(resp.read().decode('utf-8'))
    print('Permission granted:', perm_res.get('id'))

# Verify file access and webViewLink
meta_req = urllib.request.Request(
    f'https://www.googleapis.com/drive/v3/files/{file_id}?fields=id,name,webViewLink,webContentLink',
    headers={'Authorization': f'Bearer {token}'}
)
with urllib.request.urlopen(meta_req) as resp:
    info = json.loads(resp.read().decode('utf-8'))
    print('File Info:', info)
