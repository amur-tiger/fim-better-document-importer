export default function UserAbortError(message?) {
	this.name = "UserAbortError";
	this.message = message;
	this.stack = (new Error()).stack;
}

UserAbortError.prototype = new Error;