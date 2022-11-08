import {Hono} from 'hono';

const getSignature = async (secret: string, message: string) => {
    // Node.jsではないのでWeb CryptoでHMAC-SHA256の計算をする
    const algorithm = {name: 'HMAC', hash: 'SHA-256'};
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        algorithm,
        false,
        ['sign', 'verify']
    );
    const signature = await crypto.subtle.sign(
        algorithm.name,
        key,
        encoder.encode(message)
    );

    // Base64で返す
    const bytes = new Uint8Array(signature);
    const len = bytes.byteLength;
    let string = '';
    for (let i = 0; i < len; i++) {
        string += String.fromCharCode(bytes[i]);
    }
    return btoa(string);
};

const handleEvent = async (env: FetchEvent, event: object) => {
    // メッセージ以外は無視
    if (event.type !== 'message') {
        return;
    }

    const message = event.message.text;
    const reply = {
        replyToken: event.replyToken,
        messages: [
            {
                type: 'text',
                text: message
            }
        ]
    };
    console.log(reply);
    console.log(env.LINE_CHANNEL_ACCESS_TOKEN);

    const url = 'https://api.line.me/v2/bot/message/reply';
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + env.LINE_CHANNEL_ACCESS_TOKEN
    };
    const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(reply)
    });
    console.log(JSON.stringify(response));
}

/*
    handler
*/

export interface Env {
    DB: D1Database
}

export interface RequestItem {
    message_id: string,
    source: string,
    body: string,
}

const app = new Hono<{ Bindings: Env }>();

app.post('/events', async (c) => {
    // 署名チェック
    const line_channel_secret = c.env.LINE_CHANNEL_SECRET;
    const request_body = await c.req.text();
    const calculated_signature = await getSignature(line_channel_secret, request_body);
    const signature = c.req.header('x-line-signature');
    if (calculated_signature !== signature) {
        c.status(400);
        return c.text('');
    }

    // 全てのイベントを処理
    const request_object = JSON.parse(request_body);
    await Promise.all(request_object.events.map(event => handleEvent(c.env, event)));

    return c.text('ok');
})

export default app;

/*
const request_item = await c.req.json<RequestItem>();
await c.env.DB.prepare('INSERT INTO Items (message_id, source, body) VALUES (?, ?, ?)')
.bind(request_item.message_id, request_item.source, request_item.body)
.run();
c.status(201);
return c.json(request_item);
*/

