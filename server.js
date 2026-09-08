const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { Rcon } = require('rcon-client');
const fetch = require('node-fetch');

const app = express();
app.use(express.json());

// Configuration Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Configuration RCON Minecraft
const rconConfig = {
    host: process.env.RCON_HOST,
    port: parseInt(process.env.RCON_PORT || '25575'),
    password: process.env.RCON_PASSWORD
};

// Fonction pour envoyer un message privé (DM) sur Discord
async function sendDiscordDM(discordUserId, code, packageName) {
    const token = process.env.DISCORD_TOKEN;
    if (!token || !discordUserId) return;

    try {
        // 1. Créer ou récupérer le canal de discussion privé (DM) avec l'utilisateur
        const channelRes = await fetch('https://discord.com/api/v10/users/@me/channels', {
            method: 'POST',
            headers: {
                'Authorization': `Bot ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ recipient_id: discordUserId })
        });
        const channelData = await channelRes.json();

        if (channelData.id) {
            // 2. Envoyer le message dans ce canal privé
            await fetch(`https://discord.com/api/v10/channels/${channelData.id}/messages`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bot ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    content: `Merci pour ton achat du pack **${packageName}** ! 🛒\nVoici ton code secret à utiliser en jeu : \`\`\`${code}\`\`\`\nConnecte-toi sur le serveur et tape la commande : \`/achat ${code}\``
                })
            });
            console.log(`Message privé envoyé avec succès à l'utilisateur Discord ${discordUserId}`);
        }
    } catch (error) {
        console.error("Erreur lors de l'envoi du DM Discord :", error);
    }
}

// Route du webhook HelloAsso
app.post('/webhook', async (req, res) => {
    const event = req.body;
    console.log("JSON REÇU DE HELLOASSO :", JSON.stringify(event, null, 2));

    if (event.eventType === 'Order' && event.data && event.data.items) {
        for (const item of event.data.items) {
            const packageName = item.name;
            
            let mcPseudo = '';
            let discordId = ''; // On récupère l'ID Discord ou le pseudo selon ce que tu demandes dans le formulaire

            if (item.customFields) {
                for (const field of item.customFields) {
                    if (field.name && field.name.toLowerCase().includes('minecraft')) {
                        mcPseudo = field.answer;
                    }
                    if (field.name && (field.name.toLowerCase().includes('discord') || field.name.toLowerCase().includes('id'))) {
                        discordId = field.answer;
                    }
                }
            }

            if (!mcPseudo) continue;

            // Génération d'un code unique pour l'achat
            const uniqueCode = 'ATIPAS' + Math.random().toString(36).substring(2, 8).toUpperCase();

            // 1. Enregistrement dans Supabase avec le statut 'pending' et le code
            await supabase.from('pending_purchases').insert([
                { 
                    minecraft_pseudo: mcPseudo, 
                    discord_pseudo: discordId, 
                    package_name: packageName,
                    code: uniqueCode,
                    status: 'pending' 
                }
            ]);
            console.log(`Achat de ${mcPseudo} enregistré dans Supabase avec le code ${uniqueCode} !`);

            // 2. Envoi du code en Message Privé sur Discord
            if (discordId) {
                await sendDiscordDM(discordId, uniqueCode, packageName);
            }

            // 3. Attribution optionnelle du grade via RCON (si le serveur est en ligne)
            try {
                const rcon = await Rcon.connect(rconConfig);
                let command = '';
                const nameLower = packageName.toLowerCase();
                
                if (nameLower.includes('étudiant') || nameLower.includes('soutien')) {
                    command = `lp user ${mcPseudo} parent add soutien`;
                } else if (nameLower.includes('mécène')) {
                    command = `lp user ${mcPseudo} parent add mecene`;
                } else if (nameLower.includes('légende')) {
                    command = `lp user ${mcPseudo} parent add legende`;
                }

                if (command) {
                    await rcon.send(command);
                    console.log(`Grade attribué avec succès à ${mcPseudo} en jeu !`);
                }

                await rcon.end();
            } catch (rconError) {
                console.log(`Serveur Minecraft injoignable. Le code ${uniqueCode} est bien stocké en attente dans Supabase.`);
            }
        }
    }

    res.status(200).send({ status: 'success' });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Serveur webhook en écoute sur le port ${PORT}`);
});