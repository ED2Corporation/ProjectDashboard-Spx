//Write Message in Console / StatusBar
export function GetDelay(end?: Date, actualEnd?: Date) {
  let delay = 0;

  if (!end) {
    return 0; // nothing to Do, End not defined
  }
  if (!actualEnd) {
    actualEnd = new Date();
  }

  const finish = new Date(end);
  const actualFinish = new Date(actualEnd);
  const timeDifference = actualFinish.getTime() - finish.getTime();

  //Finish is in the future
  if (finish > actualFinish) {
    delay = 0;
  } //Finish already should be accomplished
  else {
    delay = Math.floor(timeDifference / (1000 * 60 * 60 * 24));
  }
  delay = delay > 0 ? delay : 0;

  // console.log(
  //   "Finish: " +
  //     finish +
  //     " ActualFinish: " +
  //     actualFinish +
  //     " delay: " +
  //     delay +
  //     " DiffDate: " +
  //     timeDifference
  // );

  return delay;
}
