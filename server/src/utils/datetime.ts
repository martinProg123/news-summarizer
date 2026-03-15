const pad = (n: number) => n.toString().padStart(2, '0');

export const toISOStringHK = (date: Date = new Date()): string => {
    const d = new Date(date);
    const year = d.toLocaleString('en-US', { timeZone: 'Asia/Hong_Kong', year: 'numeric' });
    const month = pad(parseInt(d.toLocaleString('en-US', { timeZone: 'Asia/Hong_Kong', month: 'numeric' })));
    const day = pad(parseInt(d.toLocaleString('en-US', { timeZone: 'Asia/Hong_Kong', day: 'numeric' })));
    const hour = pad(parseInt(d.toLocaleString('en-US', { timeZone: 'Asia/Hong_Kong', hour: 'numeric', hour12: false })));
    const minute = pad(parseInt(d.toLocaleString('en-US', { timeZone: 'Asia/Hong_Kong', minute: 'numeric' })));
    const second = pad(parseInt(d.toLocaleString('en-US', { timeZone: 'Asia/Hong_Kong', second: 'numeric' })));
    return `${year}-${month}-${day}T${hour}:${minute}:${second}.000+08:00`;
};
