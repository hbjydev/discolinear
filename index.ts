import { LinearClient } from "@linear/sdk";
import { Cacheables } from "cacheables";
import { Client, EmbedBuilder } from "discord.js";

const { NODE_ENV = "prod", DISCORD_TOKEN, LINEAR_TOKEN } = Bun.env;

if (!DISCORD_TOKEN) {
  throw new Error("Ensure you have set DISCORD_TOKEN!");
}

if (!LINEAR_TOKEN) {
  throw new Error("Ensure you have set LINEAR_TOKEN!");
}

if (!["prod", "debug"].includes(NODE_ENV)) {
  throw new Error("NODE_ENV must be `prod` or `debug`!");
}

const client = new Client({
    intents: ["Guilds", "GuildMessages", "DirectMessages", "MessageContent"],
});

const linear = new LinearClient({
    apiKey: LINEAR_TOKEN,
});

const keys = await linear.teams()
    .then(
        v => v.nodes
            .map(v => v.key)
            .map(v => new RegExp(`(${v}\-[0-9]*)`, 'gi'))
    );

client.once('ready', () => {
    console.log('Connected to Discord!');
});

const truncateString = (str: string, num: number) => {
  if (str.length <= num) {
    return str
  }
  return str.slice(0, num) + '...'
}

const cache = new Cacheables({ log: false, logTiming: false });

client.on('messageCreate', async event => {
    let embeds: EmbedBuilder[] = [];

    for (const key of keys) {
        const matches = event.content.matchAll(key);
        if (!matches) continue;

        const alreadyRun: string[] = [];
        for (const match of matches) {
            if (match.length == 0) continue;
            if (alreadyRun.includes(match[0].toUpperCase())) continue;

            try {
                const issue = await cache.cacheable(
                    () => linear.issue(match[0].toUpperCase()),
                    Cacheables.key('issue', match[0].toUpperCase()),
                    { cachePolicy: 'max-age', maxAge: 300000 },
                );

                const author = await cache.cacheable(
                    async () => await issue.creator,
                    Cacheables.key('issue', match[0].toUpperCase(), 'creator'),
                );
                if (!author) {
                    console.error("Failed to get issue creator!");
                    continue;
                }

                const state = await cache.cacheable(
                    async () => await issue.state,
                    Cacheables.key('issue', match[0].toUpperCase(), 'state'),
                );
                if (!state) {
                    console.error("Failed to get issue state!");
                    continue;
                }

                const description = issue.description ?? '_This issue has no description._'

                const embed = new EmbedBuilder()
                    .setAuthor({
                        name: author.displayName,
                        iconURL: author.avatarUrl,
                    })
                    .setTitle(`${issue.identifier} - ${issue.title}`)
                    .setURL(issue.url)
                    .setColor(state.color as `#${string}` ?? 'Blurple')
                    .setDescription(truncateString(description, 200))
                    .setTimestamp(issue.createdAt)
                    .setFooter({ text: `Status: ${state.name}` });

                embeds.push(embed);
            } catch (err) {
                continue;
            }

            alreadyRun.push(match[0]);
        }
    }

    if (embeds.length > 0) {
        await event.reply({ embeds });
    }
});

client.login(DISCORD_TOKEN);