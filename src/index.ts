import {Hono} from 'hono';

/*
    LINE
*/
const calcWebhookSignature = async (secret: string, message: string) => {
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

const handleEvent = async (env: Env, event: MessageEvent) => {
    console.log(JSON.stringify(event));

    // メッセージ以外、チャネルがactiveでないときは返信しない
    if (event.type !== 'message' || event.mode !== 'active') {
        return;
    }

    // 送信元ID 取得できなければ返信しない
    let source = '';
    switch (event.source.type) {
        case 'user':
            source = event.source.userId;
            break;
        case 'group':
            source = event.source.groupId;
            break;
        case 'room':
            source = event.source.roomId;
            break;
    }
    if (source === '') {
        return;
    }

    // LINE API
    const url = 'https://api.line.me/v2/bot/message/reply';
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + env.LINE_CHANNEL_ACCESS_TOKEN
    };

    const message = event.message.text;
    let reply_message = 'OK';
    switch (message) {
        case 'みせて':
        case '見せて':
            const items = await env.DB.prepare('SELECT * from Items WHERE source = ?')
                .bind(source)
                .all();
            if (items.results.length > 0) {
                reply_message = items.results.map(item => item.body).join("\r\n");
            } else {
                reply_message = '空です';
            }
            break;
        case 'けして':
        case '消して':
            await env.DB.prepare('DELETE FROM Items WHERE source = ?')
                .bind(source)
                .run();
            reply_message = '空にしました';
            break;
        default:
            await env.DB.prepare('INSERT INTO Items (message_id, source, body) VALUES (?1, ?2, ?3)')
                .bind(event.webhookEventId, source, message)
                .run();
            reply_message = '追加しました';
    }

    const reply = {
        replyToken: event.replyToken,
        messages: [
            {
                type: 'text',
                text: reply_message
            }
        ]
    };

    const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(reply)
    });
    console.log(JSON.stringify(response));
};

/*
    handler
*/
export interface Env {
    DB: D1Database
}

const app = new Hono<{ Bindings: Env }>();

app.post('/events', async (c) => {
    // 署名チェック
    const request_body = await c.req.text();
    const line_channel_secret = c.env.LINE_CHANNEL_SECRET;
    const calculated_signature = await calcWebhookSignature(line_channel_secret, request_body);
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
