import path from 'path'

export const config = {
  port: parseInt(process.env.PORT ?? '3000', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  uploadsDir: path.resolve(process.env.UPLOADS_DIR ?? './uploads'),
  isDev: (process.env.NODE_ENV ?? 'development') === 'development',
  /**
   * Het taalmodel dat mails leest (features/60-mail-import.md §6). De sleutel
   * staat in de omgeving, niet in de database: hij hoort niet in een backup van
   * de shopdata terecht te komen. Zonder sleutel draait alleen de regelmotor.
   */
  ai: {
    apiKey: process.env.ANTHROPIC_API_KEY ?? null,
    model: process.env.MAIL_AI_MODEL ?? 'claude-opus-5',
    /**
     * Zet MAIL_AI=uit om het lezen uit te schakelen zonder de sleutel weg te
     * halen. Let op: er is geen tweede motor meer, dus dan levert een mail géén
     * regels op — bewust, want liever niets dan iets fouts.
     */
    mailEnabled: (process.env.MAIL_AI ?? 'aan').toLowerCase() !== 'uit',
    /**
     * Tweede, onafhankelijke lezing van dezelfde mail. Waar de twee lezingen
     * hetzelfde zeggen is dat het sterkste signaal dat we hebben. Kost twee keer
     * de invoer-tokens; uit met MAIL_AI_CONTROLE=uit.
     */
    controle: (process.env.MAIL_AI_CONTROLE ?? 'aan').toLowerCase() !== 'uit',
    /** Hoe grondig het model mag nadenken: low, medium, high, xhigh of max. */
    effort: (process.env.MAIL_AI_EFFORT ?? 'high') as 'low' | 'medium' | 'high' | 'xhigh' | 'max',
  },
}
