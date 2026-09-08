require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const { createClient } = require('@supabase/supabase-js');
const { Rcon } = require('rcon-client');

const app = express();
app.use(bodyParser.json());

// Configuration Supabase via les variables d'environnement
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Configuration RCON Minecraft via les variables d'environnement
const rconConfig = {
  host: process.env.RCON_HOST,
  port: parseInt(process.env.RCON_PORT) || 25575,
  password: process.env.RCON_PASSWORD
};

app.post('/webhook/helloasso', async (req, res) => {
  try {
    const event = req.body;

    // Vérification basique de l'événement HelloAsso
    if (event.eventType === 'Order' && event.data && event.data.items) {
      for (const item of event.data.items) {
        const packageName = item.name;
        
        // Récupération des champs personnalisés (Minecraft et Discord)
        let mcPseudo = '';
        let discordPseudo = '';

        if (item.customFields) {
          for (const field of item.customFields) {
            if (field.name && field.name.toLowerCase().includes('minecraft')) {
              mcPseudo = field.answer;
            }
            if (field.name && field.name.toLowerCase().includes('discord')) {
              discordPseudo = field.answer;
            }
          }
        }

        if (!mcPseudo) continue;

        // 1. Enregistrement dans Supabase
        await supabase.from('pending_purchases').insert([
          { 
            minecraft_pseudo: mcPseudo, 
            discord_pseudo: discordPseudo, 
            package_name: packageName,
            status: 'pending' 
          }
        ]);
        console.log(`Achat de ${mcPseudo} enregistré dans Supabase !`);

        // 2. Attribution du grade via RCON
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
          console.log(`Attention : Impossible de contacter le serveur Minecraft (serveur fermé ?). L'achat est bien sauvegardé dans Supabase.`);
        }
      }
    }

    res.status(200).send({ status: 'success' });
  } catch (error) {
    console.error('Erreur lors du traitement du webhook :', error);
    res.status(500).send({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Serveur webhook en écoute sur le port ${PORT}`);
});