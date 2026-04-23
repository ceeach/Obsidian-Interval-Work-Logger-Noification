const { Plugin, Notice, Modal, Setting, TextComponent, PluginSettingTab } = require('obsidian');

class LoggerModal extends Modal {
    static isOpen = false;

    constructor(app, onSubmit, onRemindLater, remindLaterMinutes) {
        super(app);
        this.onSubmit = onSubmit;
        this.onRemindLater = onRemindLater;
        this.remindLaterMinutes = remindLaterMinutes;
    }

    open() {
        if (LoggerModal.isOpen) return; // Prevent opening if already open
        LoggerModal.isOpen = true;      // Lock the modal
        super.open();
    }

    onClose() {
        LoggerModal.isOpen = false;     // Unlock the modal when closed
        this.contentEl.empty();
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.addClass('hourly-logger-modal');

        contentEl.createEl('h2', { text: 'Work Check-in' });
        contentEl.createEl('p', {
            text: 'What did you accomplish since the last check-in?',
            cls: 'setting-item-description'
        });

        const input = new TextComponent(contentEl)
            .setPlaceholder('e.g. Finished Q2 report draft, reviewed PR #142...')
            .setValue('');

        input.inputEl.style.width = '100%';
        input.inputEl.style.marginBottom = '1em';

        const btnContainer = contentEl.createDiv({ cls: 'button-container' });

        const submitBtn = btnContainer.createEl('button', {
            text: 'Log Entry',
            cls: 'mod-cta'
        });
        submitBtn.addEventListener('click', () => {
            this.onSubmit(input.getValue());
            this.close();
        });

        const laterBtn = btnContainer.createEl('button', {
            text: `Remind me in ${this.remindLaterMinutes}m`
        });
        laterBtn.addEventListener('click', () => {
            if (this.onRemindLater) this.onRemindLater();
            this.close();
        });

        const skipBtn = btnContainer.createEl('button', { text: 'Skip' });
        skipBtn.addEventListener('click', () => {
            this.onSubmit(null);
            this.close();
        });

        setTimeout(() => input.inputEl.focus(), 50);

        input.inputEl.addEventListener('keydown', (evt) => {
            if (evt.key === 'Enter') {
                evt.preventDefault();
                submitBtn.click();
            }
        });
    }

    onClose() {
        this.contentEl.empty();
    }
}

class HourlyLoggerSettingTab extends PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display() {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'Hourly Work Logger Settings' });

        new Setting(containerEl)
            .setName('Start hour')
            .setDesc('First check-in hour (0–23). Default: 7 (7 AM).')
            .addText(text => text
                .setPlaceholder('7')
                .setValue(String(this.plugin.settings.startHour))
                .onChange(async (value) => {
                    const num = parseInt(value, 10);
                    this.plugin.settings.startHour = isNaN(num) ? 7 : Math.max(0, Math.min(23, num));
                    await this.plugin.saveSettings();
                    this.plugin.scheduleNext();
                }));

        new Setting(containerEl)
            .setName('End hour')
            .setDesc('Hour after which no more check-ins occur (0–23). Default: 16 (4 PM).')
            .addText(text => text
                .setPlaceholder('16')
                .setValue(String(this.plugin.settings.endHour))
                .onChange(async (value) => {
                    const num = parseInt(value, 10);
                    this.plugin.settings.endHour = isNaN(num) ? 16 : Math.max(0, Math.min(23, num));
                    await this.plugin.saveSettings();
                    this.plugin.scheduleNext();
                }));

        new Setting(containerEl)
            .setName('Interval (minutes)')
            .setDesc('How often to prompt you for a check-in. Default: 60 minutes.')
            .addText(text => text
                .setPlaceholder('60')
                .setValue(String(this.plugin.settings.intervalMinutes))
                .onChange(async (value) => {
                    const num = parseInt(value, 10);
                    this.plugin.settings.intervalMinutes = isNaN(num) ? 60 : Math.max(1, num);
                    await this.plugin.saveSettings();
                    this.plugin.scheduleNext();
                }));

        new Setting(containerEl)
            .setName('Remind me later (minutes)')
            .setDesc('How long to wait when you click Remind Me Later. Default: 10 minutes.')
            .addText(text => text
                .setPlaceholder('10')
                .setValue(String(this.plugin.settings.remindLaterMinutes))
                .onChange(async (value) => {
                    const num = parseInt(value, 10);
                    this.plugin.settings.remindLaterMinutes = isNaN(num) ? 10 : Math.max(1, num);
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Use native OS notification')
            .setDesc('Send a Windows/macOS/Linux native notification via the OS notification center.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.useNativeNotification)
                .onChange(async (value) => {
                    this.plugin.settings.useNativeNotification = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Log folder')
            .setDesc('Folder inside your vault where daily notes are stored.')
            .addText(text => text
                .setPlaceholder('Work Logs')
                .setValue(this.plugin.settings.logFolder)
                .onChange(async (value) => {
                    this.plugin.settings.logFolder = value || 'Work Logs';
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Entry tag')
            .setDesc('Tag appended to each entry (leave empty for none).')
            .addText(text => text
                .setPlaceholder('#worklog')
                .setValue(this.plugin.settings.entryTag)
                .onChange(async (value) => {
                    this.plugin.settings.entryTag = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Use input modal')
            .setDesc('Open a text-input modal for each check-in (if disabled, use the command palette to log manually).')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.useModal)
                .onChange(async (value) => {
                    this.plugin.settings.useModal = value;
                    await this.plugin.saveSettings();
                }));
    }
}

class HourlyWorkLogger extends Plugin {
    async onload() {
        console.log('Hourly Work Logger: loaded');

        this.settings = {
            startHour: 7,
            endHour: 16,
            intervalMinutes: 60,
            remindLaterMinutes: 10,
            logFolder: 'Work Logs',
            entryTag: '#worklog',
            useNativeNotification: true,
            useModal: true
        };

        await this.loadSettings();

        this.addCommand({
            id: 'open-hourly-logger',
            name: 'Open work check-in now',
            callback: () => this.triggerPrompt()
        });

        this.addCommand({
            id: 'toggle-hourly-logger',
            name: 'Toggle auto logger',
            callback: () => this.toggleScheduler()
        });

        this.addSettingTab(new HourlyLoggerSettingTab(this.app, this));

        this.requestNotificationPermission();
        this.scheduleNext();
    }

    onunload() {
        this.clearSchedule();
        console.log('Hourly Work Logger: unloaded');
    }

    clearSchedule() {
        if (this.timeoutId) {
            window.clearTimeout(this.timeoutId);
            this.timeoutId = null;
        }
    }

    toggleScheduler() {
        if (this.timeoutId) {
            this.clearSchedule();
            new Notice('Work logger paused');
        } else {
            this.scheduleNext();
            new Notice('Work logger resumed');
        }
    }

    getTodaysTriggers() {
        const { startHour, endHour, intervalMinutes } = this.settings;
        const triggers = [];
        let cursor = window.moment().hour(startHour).minute(0).second(0).millisecond(0);

        while (cursor.hour() < endHour) {
            triggers.push(cursor.clone());
            cursor.add(intervalMinutes, 'minutes');
        }
        return triggers;
    }

    scheduleNext() {
        this.clearSchedule();

        const now = window.moment();
        const { startHour } = this.settings;

        const todaysTriggers = this.getTodaysTriggers();
        let next = todaysTriggers.find(t => t.isSameOrAfter(now));

        if (!next) {
            next = window.moment()
                .add(1, 'day')
                .hour(startHour)
                .minute(0)
                .second(0)
                .millisecond(0);
        }

        const ms = next.diff(now);
        const timeStr = next.format('HH:mm');
        const minUntil = Math.round(ms / 1000 / 60);

        console.log(`Hourly Work Logger: next check-in at ${timeStr} (in ${minUntil} min)`);

        this.timeoutId = window.setTimeout(() => {
            this.triggerPrompt();
            this.scheduleNext();
        }, ms);
    }

    /**
     * Schedule a one-off reminder after N minutes, then resume normal scheduling.
     */
    scheduleReminder(minutes) {
        this.clearSchedule();
        const ms = minutes * 60 * 1000;
        const timeStr = window.moment().add(minutes, 'minutes').format('HH:mm');

        console.log(`Hourly Work Logger: reminder set for ${timeStr} (${minutes} min)`);
        new Notice(`Reminder set for ${timeStr} (${minutes} min)`, 3000);

        this.timeoutId = window.setTimeout(() => {
            this.triggerPrompt();
            this.scheduleNext();
        }, ms);
    }

    /* ─────────── Native OS Notification ─────────── */

    requestNotificationPermission() {
        if (!window.Notification) return;
        if (window.Notification.permission === 'default') {
            window.Notification.requestPermission().then(permission => {
                console.log('Hourly Work Logger: notification permission =', permission);
            });
        }
    }

    focusObsidianWindow() {
        try {
            const electron = window.require('electron');
            if (electron && electron.remote) {
                const win = electron.remote.getCurrentWindow();
                if (win) {
                    if (win.isMinimized()) win.restore();
                    win.show();
                    win.focus();
                    win.flashFrame(false);
                    win.flashFrame(true);
                    setTimeout(() => {
                        win.setAlwaysOnTop(true);
                        win.setAlwaysOnTop(false);
                    }, 100);
                    return;
                }
            }
        } catch (e) {
            console.warn('Hourly Work Logger: Electron remote focus failed:', e);
        }

        try {
            const remote = window.require('@electron/remote');
            if (remote) {
                const win = remote.getCurrentWindow();
                if (win) {
                    if (win.isMinimized()) win.restore();
                    win.show();
                    win.focus();
                    return;
                }
            }
        } catch (e) {
            console.warn('Hourly Work Logger: @electron/remote focus failed:', e);
        }

        window.focus();
    }

    sendNativeNotification(title, body) {
        try {
            // Try Electron native Notification with action buttons first
            const electron = window.require('electron');
            if (electron && electron.remote) {
                const { Notification } = electron.remote;
                const laterText = `Remind me in ${this.settings.remindLaterMinutes}m`;

                const n = new Notification({
                    title: title,
                    body: body,
                    actions: [
                        { text: laterText, type: 'button' }
                    ],
                    timeoutType: 'never',
                    silent: false
                });

                n.on('action', (event, index) => {
                    // index 0 = Remind me later
                    this.scheduleReminder(this.settings.remindLaterMinutes);
                    n.close();
                });

                n.on('click', () => {
                    this.focusObsidianWindow();
                    if (this.settings.useModal) {
                        const now = window.moment();
                        new LoggerModal(
                            this.app,
                            async (entry) => {
                                if (entry && entry.trim()) {
                                    await this.appendEntry(entry.trim(), now);
                                    new Notice('Entry saved to daily note', 3000);
                                } else {
                                    new Notice('Skipped', 2000);
                                }
                            },
                            () => this.scheduleReminder(this.settings.remindLaterMinutes),
                            this.settings.remindLaterMinutes
                        ).open();
                    }
                    n.close();
                });

                n.show();
                return true;
            }
        } catch (e) {
            console.warn('Hourly Work Logger: Electron native notification failed:', e);
        }

        // Fallback to standard Web Notification (no action buttons)
        try {
            if (!window.Notification) return false;
            const permission = window.Notification.permission;

            if (permission === 'granted') {
                const n = new window.Notification(title, {
                    body: body,
                    requireInteraction: true
                });

                n.onclick = () => {
                    this.focusObsidianWindow();
                    n.close();
                };
                return true;
            }

            if (permission === 'default') {
                window.Notification.requestPermission();
                return false;
            }
        } catch (e) {
            console.warn('Hourly Work Logger: web notification error:', e);
        }
        return false;
    }

    /* ─────────── Prompt & Logging ─────────── */

    triggerPrompt() {
        const now = window.moment();
        const timeLabel = now.format('h:mm A');
        const title = `Work Check-in (${timeLabel})`;
        const message = 'What did you accomplish since the last check-in?';

        if (this.settings.useNativeNotification) {
            this.sendNativeNotification(title, message);
        }

        new Notice(`${title}: ${message}`, 15000);

        if (this.settings.useModal) {
            new LoggerModal(
                this.app,
                async (entry) => {
                    if (entry && entry.trim()) {
                        await this.appendEntry(entry.trim(), now);
                        new Notice('Entry saved to daily note', 3000);
                    } else {
                        new Notice('Skipped', 2000);
                    }
                },
                () => this.scheduleReminder(this.settings.remindLaterMinutes),
                this.settings.remindLaterMinutes
            ).open();
        }
    }

    async appendEntry(entry, time) {
        const { logFolder, entryTag } = this.settings;
        const dateStr = time.format('YYYY-MM-DD');
        const filePath = `${logFolder}/${dateStr}.md`;

        const folder = this.app.vault.getAbstractFileByPath(logFolder);
        if (!folder) {
            await this.app.vault.createFolder(logFolder).catch(() => {});
        }

        let file = this.app.vault.getAbstractFileByPath(filePath);

        if (!file) {
            const content = this.generateDailyNote(time);
            file = await this.app.vault.create(filePath, content);
        }

         // Capture the end time (now) and calculate the start time (1 hour ago)
        // Grab the interval from your settings (defaults to 60 if it can't find it)
        const interval = this.settings.intervalMinutes || 60;
        
        // Capture the end time (now) and calculate the start time (X minutes ago)
        const endTimeStr = time.format('HH:mm');
        const startTimeStr = time.clone().subtract(interval, 'minutes').format('HH:mm');
        const tag = entryTag ? ` ${entryTag}` : '';
        
        // Formats as a completed task with a start and end time block for Day Planner
        const line = `\n- [x] ${startTimeStr} - ${endTimeStr} ${entry}${tag}`;


        const currentContent = await this.app.vault.read(file);
        await this.app.vault.modify(file, currentContent + line);
    }

    generateDailyNote(time) {
        const dateStr = time.format('YYYY-MM-DD');
        const dayStr = time.format('dddd, MMMM D, YYYY');
        
        // We changed "## Entries" to "# Day planner" so the Day Planner plugin detects the section.
        return `---\ndate: ${dateStr}\nday: ${time.format('dddd')}\ntags: worklog\n---\n\n# Work Log — ${dayStr}\n\n# Day planner\n`;
    }

    async loadSettings() {
        const data = await this.loadData();
        if (data) {
            this.settings = { ...this.settings, ...data };
        }
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}

module.exports = HourlyWorkLogger;
