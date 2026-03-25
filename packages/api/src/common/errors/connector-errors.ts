export class TransientConnectorError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = 'TransientConnectorError';
  }
}

export class PermanentConnectorError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = 'PermanentConnectorError';
  }
}
