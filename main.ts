import { App, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { GeminiService } from './src/services/GeminiService';
import { LanguageSelectionModal } from './src/modals/LanguageSelectionModal';
import { MarkdownRenderer } from 'obsidian';

interface ChatMessage {
	role: 'user' | 'bot';
	content: string;
	timestamp: number;
}

interface GeminiChatbotSettings {
	apiKey: string;
	floatingPosition: {
		x: number;
		y: number;
	};
	isDocked: boolean;
}

const DEFAULT_SETTINGS: GeminiChatbotSettings = {
	apiKey: '',
	floatingPosition: {
		x: 20,
		y: 20
	},
	isDocked: false
}

export default class GeminiChatbotPlugin extends Plugin {
	settings: GeminiChatbotSettings;
	chatIcon: HTMLElement;
	chatContainer: HTMLElement;
	private geminiService: GeminiService | null = null;
	private messagesContainer: HTMLElement | null = null;
	private inputField: HTMLTextAreaElement | null = null;
	private currentFileContent: string | null = null;
	
	async onload() {
		await this.loadSettings();
		
		if (this.settings.apiKey) {
			this.initializeGeminiService();
		}
		
		// Add settings tab
		this.addSettingTab(new GeminiChatbotSettingTab(this.app, this));
		
		// Add floating chat icon
		this.addFloatingIcon();
		
		// Add chat container
		this.addChatContainer();
	}
	
	public initializeGeminiService() {
		try {
			if (this.settings.apiKey) {
				const decryptedKey = this.decryptApiKey(this.settings.apiKey);
				this.geminiService = new GeminiService(decryptedKey);
			}
		} catch (error) {
			console.error('Failed to initialize Gemini service:', error);
		}
	}
	
	private async handleMessage(message: string) {
		if (!this.geminiService || !message.trim()) return;
		
		this.toggleSuggestedActions(false);
		
		const contextMessage = this.currentFileContent 
			? `Context from current note:\n${this.currentFileContent}\n\nUser question: ${message}`
			: message;
		
		const userMessage: ChatMessage = {
			role: 'user',
			content: message,
			timestamp: Date.now()
		};
		
		this.addMessageToChat(userMessage);
		
		// Add typing indicator
		const typingIndicator = document.createElement('div');
		typingIndicator.addClass('typing-indicator');
		typingIndicator.innerHTML = `
			<span></span>
			<span></span>
			<span></span>
		`;
		this.messagesContainer?.appendChild(typingIndicator);
		
		try {
			const response = await this.geminiService.sendMessage(contextMessage);
			typingIndicator.remove();
			
			const botMessage: ChatMessage = {
				role: 'bot',
				content: response,
				timestamp: Date.now()
			};
			
			await this.addMessageToChat(botMessage);
		} catch (error) {
			typingIndicator.remove();
			this.addErrorMessage('Failed to get response from Gemini');
		}
	}
	
	private async addMessageToChat(message: ChatMessage) {
		if (!this.messagesContainer) return;
		
		const messageEl = document.createElement('div');
		messageEl.addClass(`gemini-message-${message.role}`);
		
		if (message.role === 'bot') {
			// Create a container for markdown content
			const markdownContainer = messageEl.createDiv();
			await MarkdownRenderer.renderMarkdown(
				message.content,
				markdownContainer,
				'',
				this
			);
		} else {
			// For user messages, just use text
			messageEl.textContent = message.content;
		}
		
		this.messagesContainer.appendChild(messageEl);
		this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
	}
	
	private addErrorMessage(message: string) {
		if (!this.messagesContainer) return;
		
		const errorEl = document.createElement('div');
		errorEl.addClass('gemini-message-error');
		errorEl.textContent = message;
		this.messagesContainer.appendChild(errorEl);
	}
	
	private addFloatingIcon() {
		this.chatIcon = document.createElement('div');
		this.chatIcon.addClass('gemini-chat-icon');
		this.chatIcon.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
			<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
		</svg>`;
		
		// Add click handler
		this.chatIcon.addEventListener('click', () => {
			this.toggleChatContainer();
		});
		
		document.body.appendChild(this.chatIcon);
	}
	
	private addChatContainer() {
		this.chatContainer = document.createElement('div');
		this.chatContainer.addClass('gemini-chat-container');
		this.chatContainer.style.display = 'none';
		
		// Add chat components
		this.chatContainer.innerHTML = `
			<div class="gemini-chat-header">
				<div class="current-file"></div>
				<div class="chat-header-controls">
					<button class="history-button">
						<svg width="16" height="16" viewBox="0 0 24 24">
							<path fill="currentColor" d="M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0 0 13 21a9 9 0 0 0 0-18zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/>
						</svg>
					</button>
					<button class="more-button">•••</button>
					<button class="close-button">×</button>
				</div>
			</div>
			
			<div class="bot-info">
				<div class="bot-avatar">
					<svg width="20" height="20" viewBox="0 0 24 24">
						<path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-14c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm0 6c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/>
					</svg>
				</div>
				<div class="bot-greeting">Hi Neo xD! How can I help you today?</div>
			</div>

			<div class="gemini-chat-messages"></div>

			<div class="suggested-actions">
				<h3>Suggested</h3>
				<div class="action-button">
					<span class="action-icon">📝</span>
					Summarize this page
				</div>
				<div class="action-button">
					<span class="action-icon">🔍</span>
					Ask about this page
				</div>
				<div class="action-button">
					<span class="action-icon">✓</span>
					Find action items
				</div>
				<div class="action-button">
					<span class="action-icon">🌐</span>
					Translate to
				</div>
			</div>

			<div class="chat-input-container">
				<div class="chat-input-wrapper">
					<textarea class="chat-input" placeholder="Ask anything or select..."></textarea>
					<div class="input-actions">
						<button class="attach-button">
							<svg width="16" height="16" viewBox="0 0 24 24">
								<path fill="currentColor" d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5a2.5 2.5 0 0 1 5 0v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5a2.5 2.5 0 0 0 5 0V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z"/>
							</svg>
						</button>
						<button class="mention-button">@</button>
						<button class="send-button">↑</button>
					</div>
				</div>
			</div>
		`;
		
		document.body.appendChild(this.chatContainer);
		
		// Add event listeners for the buttons
		this.addChatEventListeners();
	}
	
	private addChatEventListeners() {
		const closeButton = this.chatContainer.querySelector('.close-button');
		closeButton?.addEventListener('click', () => {
			this.toggleChatContainer();
		});
		
		const sendButton = this.chatContainer.querySelector('.send-button');
		const inputField = this.chatContainer.querySelector('.chat-input') as HTMLTextAreaElement;
		this.inputField = inputField;
		this.messagesContainer = this.chatContainer.querySelector('.gemini-chat-messages');
		
		sendButton?.addEventListener('click', () => {
			if (this.inputField) {
				const message = this.inputField.value.trim();
				if (message) {
					this.handleMessage(message);
					this.inputField.value = '';
				}
			}
		});
		
		inputField?.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter' && !e.shiftKey && this.inputField) {
				e.preventDefault();
				const message = this.inputField.value.trim();
				if (message) {
					this.handleMessage(message);
					this.inputField.value = '';
				}
			}
		});
		
		// Update action buttons handlers
		const actionButtons = this.chatContainer.querySelectorAll('.action-button');
		actionButtons.forEach(button => {
			button.addEventListener('click', async () => {
				const action = button.textContent?.trim();
				
				if (!this.currentFileContent) {
					this.addErrorMessage('No active file selected');
					return;
				}
				
				// Hide suggested actions when selecting an action
				this.toggleSuggestedActions(false);
				
				switch(action) {
					case 'Summarize this page':
						this.handleMessage(`Please provide a concise summary of this content:\n${this.currentFileContent}`);
						break;
						
					case 'Ask about this page':
						if (this.inputField) {
							this.inputField.focus();
							this.inputField.placeholder = 'Ask a question about this page...';
						}
						break;
						
					case 'Find action items':
						this.handleMessage(`Please analyze this content and list all action items, tasks, and to-dos:\n${this.currentFileContent}`);
						break;
						
					case 'Translate to':
						this.showLanguageSelectionModal(this.currentFileContent);
						break;
				}
			});
		});
	}
	
	private showLanguageSelectionModal(content: string) {
		new LanguageSelectionModal(this.app, (language: string) => {
			if (this.geminiService) {
				this.geminiService.translateContent(content, language)
					.then(translation => {
						this.addMessageToChat({
							role: 'bot',
							content: translation,
							timestamp: Date.now()
						});
					})
					.catch(error => {
						this.addErrorMessage('Translation failed');
						console.error('Translation error:', error);
					});
			}
		}).open();
	}
	
	private toggleChatContainer() {
		const isVisible = this.chatContainer.style.display !== 'none';
		this.chatContainer.style.display = isVisible ? 'none' : 'flex';
		
		if (!isVisible) {
			// Clear previous messages when opening
			if (this.messagesContainer) {
				this.messagesContainer.innerHTML = '';
			}
			
			// Update header with current file name
			this.updateChatHeader();
			
			// Get active file when opening chat
			const activeFile = this.app.workspace.getActiveFile();
			if (activeFile) {
				this.app.vault.read(activeFile).then(content => {
					this.currentFileContent = content;
				});
			}
			
			// Show suggested actions
			this.toggleSuggestedActions(true);
			this.chatContainer.style.bottom = '80px';
			this.chatContainer.style.right = '20px';
		}
	}
	
	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}
	
	async saveSettings() {
		await this.saveData(this.settings);
	}
	
	onunload() {
		this.chatIcon?.remove();
		this.chatContainer?.remove();
	}
	
	public encryptApiKey(key: string): string {
		return btoa(key.split('').reverse().join(''));
	}
	
	public decryptApiKey(encryptedKey: string): string {
		return atob(encryptedKey).split('').reverse().join('');
	}
	
	// Add this method to handle showing/hiding suggested actions
	private toggleSuggestedActions(show: boolean) {
		const suggestedActions = this.chatContainer.querySelector('.suggested-actions') as HTMLElement;
		if (suggestedActions) {
			suggestedActions.style.display = show ? 'block' : 'none';
		}
	}
	
	private updateChatHeader() {
		const activeFile = this.app.workspace.getActiveFile();
		const headerEl = this.chatContainer.querySelector('.current-file');
		if (headerEl && activeFile) {
			headerEl.textContent = activeFile.basename;
			(headerEl as HTMLElement).style.display = 'block';
		} else if (headerEl) {
			(headerEl as HTMLElement).style.display = 'none';
		}
	}
}

class GeminiChatbotSettingTab extends PluginSettingTab {
	plugin: GeminiChatbotPlugin;
	
	constructor(app: App, plugin: GeminiChatbotPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}
	
	display(): void {
		const {containerEl} = this;
		containerEl.empty();
		
		new Setting(containerEl)
			.setName('Gemini API Key')
			.setDesc('Enter your Gemini API key (stored securely)')
			.addText(text => {
				text.inputEl.type = 'password';
				text.setPlaceholder('Enter your API key')
					.setValue(this.plugin.settings.apiKey ? '••••••••' : '')
					.onChange(async (value) => {
						// Only update if the value is different from placeholder
						if (value !== '••••••••') {
							this.plugin.settings.apiKey = this.plugin.encryptApiKey(value);
							await this.plugin.saveSettings();
							// Reinitialize the service with new key
							this.plugin.initializeGeminiService();
						}
					});
				
				// Add show/hide password toggle
				const toggleButton = text.inputEl.createEl('button', {
					text: '👁️',
					cls: 'password-toggle',
				});
				toggleButton.style.position = 'absolute';
				toggleButton.style.right = '5px';
				toggleButton.style.top = '50%';
				toggleButton.style.transform = 'translateY(-50%)';
				toggleButton.style.background = 'transparent';
				toggleButton.style.border = 'none';
				toggleButton.style.cursor = 'pointer';
				
				toggleButton.addEventListener('click', (e) => {
					e.preventDefault();
					text.inputEl.type = text.inputEl.type === 'password' ? 'text' : 'password';
				});
			});
	}
}
