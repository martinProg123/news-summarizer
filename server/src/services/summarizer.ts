import axios from 'axios';
import { article_systemPrompt } from '../config/prompts';

export const getSummary = async (title: string, cleanContent: string): Promise<string | null> => {
    try {
        const response = await axios.post("http://localhost:11434/api/chat", {
            "model": "gemma3:4b",
            "messages": [
                { "role": "system", "content": article_systemPrompt },
                {
                    "role": "user", "content": `
                    ### Title: ${title}
                    
                    ### Article Content:
                    ${cleanContent}
                    
                    ---
                    Instruction: summarize for the HK News Digest.
                    ` }
            ],
            "stream": false
        }, {
            timeout: 60000
        });

        const rawContent = response.data.message?.content;
        return rawContent ? extractSummary(rawContent) : null;
    } catch (err) {
        console.error("Failed to get summary:", err);
        return null;
    }
};

export const extractSummary = (text: string): string | null => {
    const cleaned = text
        .replace(/```html\s*/gi, '')
        .replace(/```json\s*/gi, '')
        .replace(/```\s*$/gm, '')
        .trim();

    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
        try {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed.summary && typeof parsed.summary === 'string' && parsed.summary.length > 10) {
                return parsed.summary;
            }
        } catch (e) {
            // Continue to fallbacks
        }
    }

    const summaryMatch = cleaned.match(/(?:"|')summary(?:"|')\s*:\s*(?:"|')([^"']{20,})/i);
    if (summaryMatch && summaryMatch[1]) {
        return summaryMatch[1];
    }

    if (cleaned.length > 20 && cleaned.length < 2000) {
        return cleaned;
    }

    return null;
};
