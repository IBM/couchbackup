const path = require('node:path')
const fs = require('node:fs').promises
const util = require('node:util')

async function attachmentBackupHandler (batch) {
	const { docs } = batch
	for (let doc of docs) {
		if (!doc._attachments) { continue }
		for await (let attachmentName of Object.keys(doc._attachments)) {
			const attachment = doc._attachments[attachmentName]
			const parameters = {
				db: this.dbName,
				docId: doc._id,
				attachmentName
			}
			const attachmentStream = await this.service.getAttachment(parameters)
			attachment.data = toBase64(await streamToBuffer(attachmentStream.result))
			delete attachment.stub
			delete attachment.length
			delete attachment.revpos
		}
	}
	return batch
}

module.exports.attachmentBackupHandler = attachmentBackupHandler

// h/t: https://stackoverflow.com/questions/10623798/how-do-i-read-the-contents-of-a-node-js-stream-into-a-string-variable
function streamToBuffer (stream) {
  const chunks = [];
  return new Promise((resolve, reject) => {
	stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
	stream.on('error', (err) => reject(err));
	stream.on('end', () => resolve(Buffer.concat(chunks)));
  })
}

function toBase64 (data) {
	return Buffer.from(data).toString('base64')
}
