# Your Copilot - Your Self-Hosted AI Assistant for VS Code

<div align="center">
  <img src="https://i.ibb.co/qf9ncw5/Captura-de-Tela-2025-02-15-a-s-17-27-39.png" alt="your copilot banner" width="400"/>
  <img src="https://i.ibb.co/Zps38zrZ/Captura-de-Tela-2025-02-15-a-s-17-28-35.png" alt="your copilot banner" width="400"/>
</div>

[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/paulorodrigues.your-copilot?color=blue&label=VS%20Code%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=paulorodrigues.your-copilot)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub](https://img.shields.io/github/stars/PauloRodrigues33/Your-Copilot?style=social)](https://github.com/PauloRodrigues33/Your-Copilot)

## Overview

Your Copilot is a powerful, open-source VS Code extension that enables you to use your own LLM (Large Language Model) server directly within Visual Studio Code. Get AI-powered code generation, suggestions, and insights while keeping your data secure and under your control.

## Key Features

- 🚀 Self-hosted LLM integration
- 💻 Code generation and suggestions
- 🔒 Local data security
- 🔄 Real-time streaming support
- 🎯 Compatible with OpenAI API standard
- 📝 Smart file mentioning and context awareness

## Planned Features 🚀

We're actively working on bringing more powerful features to Your Copilot:

### 🔮 Offline Tab Completion
- Smart code completion that works without internet connection
- Faster response times with local processing
- Language-specific completions based on your codebase

### 📚 RAG (Retrieval-Augmented Generation)
- Enhanced context understanding using your project's documentation
- Improved code suggestions based on your codebase history
- Smart integration with project-specific knowledge

### 🤖 Agentic Behaviour
- Autonomous code refactoring suggestions
- Proactive bug detection and fixes
- Smart project structure optimization
- Automated documentation generation

## Who Is This For?

- Developers who want to use their own LLM server in VS Code
- Those seeking code generation and AI assistance without subscription costs
- Privacy-conscious users who want to keep their data secure locally
- LLM and Open Source enthusiasts

## Prerequisites

⚠️ **Important:** You need your own LLM server that's compatible with the OpenAI API standard to use this extension.

## Quick Start

1. Install the extension from VS Code Marketplace
2. Open the extension settings
3. Configure your LLM Server URL (include 'http://' or 'https://')
4. (Optional) Add your OpenAI API token if using the official API
5. Toggle streaming messages according to your server's capabilities

## Recommended LLM Servers

We recommend using any of these excellent LLM servers:

- [LM Studio](https://lmstudio.ai/) - Fast and user-friendly
- [Ollama](https://ollama.com/) - Simple and efficient
- [vllm](https://vllm.ai/) - High-performance inference
- Any server supporting the OpenAI API standard

## Important Notes

- This extension does not store or share any of your data
- Response quality, accuracy, and speed depend on your chosen LLM model and server setup
- Streaming feature can be disabled if your server doesn't support it or if you experience performance issues

## Contributing 🤝

Your Copilot is an open-source project and we welcome contributions! Whether you're fixing bugs, adding new features, improving documentation, or spreading the word - your help is welcome and appreciated.

- 🐛 Found a bug? Open an issue!
- ✨ Want to add a feature? Submit a pull request!
- 📖 Documentation improvements are always welcome

Check out our [GitHub repository](https://github.com/PauloRodrigues33/Your-Copilot) to get started.

## About

Proudly developed by [Paulo Rodrigues](https://github.com/PauloRodrigues33)

## License

MIT License - Copyright (c) 2024 Paulo Rodrigues

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions: The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.