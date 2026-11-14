/**
 * Форматує дату або поточний час відповідно до регіональних налаштувань часу в ОС користувача
 * (підтримує як 24-годинний формат, так і 12-годинний AM/PM залежно від параметрів Windows/ОС).
 */
export function formatSystemTime(dateInput?: string | Date | number): string {
  const date = dateInput !== undefined ? new Date(dateInput) : new Date();
  const validDate = Number.isNaN(date.getTime()) ? new Date() : date;

  const sysConfig =
    typeof window !== 'undefined' ? window.electronAPI?.getSystemTimeConfig?.() : undefined;

  const options: Intl.DateTimeFormatOptions = {
    hour: sysConfig?.twoDigitHour === false ? 'numeric' : '2-digit',
    minute: '2-digit',
  };

  if (typeof sysConfig?.hour12 === 'boolean') {
    options.hour12 = sysConfig.hour12;
  }

  return validDate.toLocaleTimeString(sysConfig?.locale || undefined, options);
}
