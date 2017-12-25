const execFile = require('util').promisify(require('child_process').execFile);
const iconv = require('iconv-lite');
const config = require('./config.json');
const nodemailer = require('nodemailer');
const fs = require('fs')
    , Log = require('log')
    , log = new Log('debug', fs.createWriteStream(__dirname + '/watch.log', { flags: 'a' }));
const mailFrom = 'admin@test.com';

async function getTasklist(args) {
    let { stdout } = await execFile('tasklist', args, { encoding: 'big5' });
    return stdout;
}

async function sendmail(transporter, mailOptions) {
    console.log(`Send mail:  ${mailOptions.subject}`);
    await transporter.sendMail(mailOptions);
}

function convertEncoding(str) {
    let buf = Buffer.from(str);
    let uft8Buf = iconv.encode(iconv.decode(buf, 'big5'), 'UTF-8');
    return uft8Buf.toString();
}

function addDescription(tasklistText) {
    let ary = tasklistText.split(/\r?\n/);
    let processDescription = config.processDescription;

    for (let i = 0; i < ary.length; i++) {
        let line = ary[i];

        for (let pname in processDescription) {
            if (line.indexOf(pname) != -1) {
                ary[i] = line + '    ' + processDescription[pname];
                break;
            }
        }
    }
    return ary.join('\r\n');
}

async function watchServer(server, transporter) {
    let args = [ '/V' ];
    args.push(
        '/S', server.ip,
        '/U', server.username,
        '/P', server.password
    );
    console.log(`connect to server:  ${server.ip}`);
    log.info(`connect to server:  ${server.ip}`);
    let tasklistText = '';

    try {
        tasklistText = await getTasklist(args);
    }
    catch(e) {
        console.log(e);
        log.error(`connect to server error:  ${server.ip}`);
        return;
    }

    if (transporter) {
        let tasklistWithDesc = addDescription(convertEncoding(tasklistText));
        let mailSubject = `Server task list, server name: ${server.name}, ip: ${server.ip}`;
        let mailBody = 'The snapshot timestamp: ' + new Date().toLocaleString() + '\r\n' + tasklistWithDesc;
        let mailRecipients = server.informRecipients;

        if (!mailRecipients) {
            return;
        }

        let mailOptions = {
            from: mailFrom,
            to: mailRecipients,
            subject: mailSubject,
            text: mailBody
        };
        try {
            await sendmail(transporter, mailOptions);
        }
        catch(e) {
            console.log(e);
            log.error(`send mail error:  ${mailOptions.subject}`);
            return;
        }
    }
}

function startWatch() {
    let servers = config.watchServers || [];
    let mailHost = config.mail.smtpHost;
    let mailPort = config.mail.smtpPort;

    let mailTransporter = nodemailer.createTransport({
        host: config.mail.smtpHost || '127.0.0.1',
        port: config.mail.smtpPort || 25,
        secure: false
    });

    for (let server of servers) {
        watchServer(server, mailTransporter);
    }
}

startWatch();