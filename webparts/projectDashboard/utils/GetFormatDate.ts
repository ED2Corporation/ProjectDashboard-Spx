//Write Message in Console / StatusBar
export function GetFormatDate(dateString?: Date) : string {
  if (!dateString) {
    return ""; // Returns an empty string if the date is invalid
  }
  const date = new Date(dateString);
  
  return new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  }).format(date);
}
