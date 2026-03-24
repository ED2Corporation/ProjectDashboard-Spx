//Write Message in Console / StatusBar
export function MessageLog(
  message: string,
  srcReference: string = "Debug",
  messageType: number = 0,
  writeConsole: boolean = false
) {
  if (messageType === 0) message = "[Info: " + srcReference + " ] " + message; //Informative
  if (messageType === 1) message = "[Alert: " + srcReference + " ] " + message; //Alert
  if (messageType === 2) message = "[ERROR: " + srcReference + " ] " + message; //Error

  if (writeConsole) console.log(message);

  // Object to create status bar
  return message;
}
