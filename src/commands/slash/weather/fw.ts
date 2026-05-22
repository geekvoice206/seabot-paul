import { ChatInputCommandBuilder } from "@discordjs/builders";
import { EmbedBuilder } from "discord.js";
import { format, addHours, fromUnixTime } from "date-fns";

import SlashCommand from "../SlashCommand";
import WeatherApi from "./WeatherApi";

// ─── Snarky comment generators ───────────────────────────────────────────────

function tempRoast(tempF: number): string {
  if (tempF <= 10)
    return "It is **absolutely balls-freezing** out there. Staying inside is not a choice, it's survival.";
  if (tempF <= 25)
    return "Holy shit it's cold. Your tears will freeze before they hit your cheeks.";
  if (tempF <= 35)
    return "It's cold as hell. Wear a goddamn coat, you maniac.";
  if (tempF <= 45)
    return "Chilly as your ex's heart. Layer up, buttercup.";
  if (tempF <= 55)
    return "It's fine. Not great, not shit. Just... existing.";
  if (tempF <= 65)
    return "Oh look, tolerable weather. Don't get used to it.";
  if (tempF <= 75)
    return "Actually kinda nice out? What the hell is going on?";
  if (tempF <= 85)
    return "Warm and sweaty, just like a bad gym locker room. Hydrate or die.";
  if (tempF <= 95)
    return "It's hot as Satan's armpit out there. Why are you even going outside?";
  return "WHAT IN THE ACTUAL HELL. It's so hot your phone might melt. Stay the fuck inside.";
}

function conditionRoast(description: string): string {
  const d = description.toLowerCase();
  if (d.includes("thunderstorm"))
    return "⛈️ Thunderstorms! Nature's way of saying 'screw your plans'.";
  if (d.includes("drizzle"))
    return "🌧️ Drizzle. Not enough to cancel plans, just enough to ruin your hair.";
  if (d.includes("heavy rain") || d.includes("extreme rain"))
    return "🌧️ It's raining like God spilled his drink. You WILL get soaked.";
  if (d.includes("rain"))
    return "🌧️ It's raining. Grab an umbrella or just accept your wet-dog fate.";
  if (d.includes("snow"))
    return "❄️ Snow! Beautiful. Romantic. A complete pain in your ass.";
  if (d.includes("sleet") || d.includes("freezing"))
    return "🧊 Freezing rain — the worst thing weather can do. Nature hates you specifically.";
  if (d.includes("fog") || d.includes("mist"))
    return "🌫️ Foggy AF. Drive slow or meet your maker.";
  if (d.includes("smoke") || d.includes("haze"))
    return "💨 Hazy and gross. Breathing outside is optional, apparently.";
  if (d.includes("dust") || d.includes("sand"))
    return "🌪️ There's literal dirt in the air. What kind of hellscape is this?";
  if (d.includes("tornado"))
    return "🌪️ TORNADO CONDITIONS. Why are you checking a Discord bot right now?? RUN.";
  if (d.includes("clear"))
    return "☀️ Clear skies! Enjoy it before everything goes to shit again.";
  if (d.includes("few clouds"))
    return "⛅ Mostly sunny with a hint of 'maybe it'll suck later'.";
  if (d.includes("scattered clouds"))
    return "🌤️ Scattered clouds. Nature can't make up its damn mind.";
  if (d.includes("broken clouds") || d.includes("overcast"))
    return "☁️ Cloudy and grey, like your mood on a Monday.";
  return `🌡️ ${description} — whatever the hell that means, dress accordingly.`;
}

function windRoast(speedMph: number): string {
  if (speedMph < 5) return "winds are basically a gentle suggestion";
  if (speedMph < 15) return `breezy at ${speedMph} mph — mildly annoying`;
  if (speedMph < 25)
    return `winds at ${speedMph} mph — your umbrella WILL betray you`;
  if (speedMph < 40)
    return `winds at ${speedMph} mph — hold onto your shit, literally`;
  return `winds at ${speedMph} mph — holy crap, are you near a hurricane?`;
}

function humidityRoast(humidity: number): string {
  if (humidity >= 90) return `${humidity}% humidity — a.k.a. breathing soup`;
  if (humidity >= 70) return `${humidity}% humidity — sticky and miserable`;
  if (humidity >= 50) return `${humidity}% humidity — tolerable, barely`;
  if (humidity >= 30) return `${humidity}% humidity — actually decent`;
  return `${humidity}% humidity — dry enough to make your nose bleed`;
}

function forecastMiniRoast(tempF: number, description: string): string {
  const d = description.toLowerCase();
  if (d.includes("thunderstorm")) return "⛈️ NOPE. Stay home.";
  if (d.includes("rain") || d.includes("drizzle")) return "🌧️ Wet. As usual.";
  if (d.includes("snow")) return "❄️ Snow. Great. Perfect. Cool.";
  if (d.includes("clear") && tempF > 70) return "☀️ Decent, don't waste it.";
  if (d.includes("clear")) return "☀️ Clear. Suspicious.";
  if (d.includes("cloud")) return "☁️ Grey. Shocking.";
  if (d.includes("fog") || d.includes("mist")) return "🌫️ Foggy garbage.";
  if (tempF >= 90) return "🔥 Hot as balls.";
  if (tempF <= 20) return "🥶 Frostbite weather.";
  return "🤷 Fine, whatever.";
}

// ─── Slash command ─────────────────────────────────────────────────────────

export default new SlashCommand({
  description: "Get weather & 24hr forecast with zero chill",
  help: "snarkycast [98102]",
  name: "snarkycast",
  builder: new ChatInputCommandBuilder().addNumberOptions([
    (option) =>
      option
        .setName("zipcode")
        .setDescription("5-digit US zip code")
        .setRequired(true)
        .setMinValue(10000)
        .setMaxValue(99999),
  ]),
  execute: async (interaction) => {
    const zip = interaction.options.getNumber("zipcode");

    if (!zip || zip.toString().length !== 5) {
      await interaction.reply(
        "That's not a valid 5-digit zip code. Try harder.",
      );
      return;
    }

    await interaction.deferReply();
    const zipStr = zip.toString();

    // Fetch current weather + forecast in parallel
    const [currentResult, forecastResult] = await Promise.all([
      WeatherApi.getCurrentWeather(zipStr),
      WeatherApi.getWeatherForecast(zipStr),
    ]);

    if (!currentResult) {
      await interaction.editReply(
        `**${zipStr}** isn't a real place, apparently. Or the weather gods are ignoring you.`,
      );
      return;
    }

    const { currentWeather, geoInfo } = currentResult;

    const locationName = (
      geoInfo
        ? [geoInfo.name, geoInfo?.state || null, geoInfo.country]
        : [currentWeather?.name ?? null, currentWeather?.sys?.country]
    )
      .filter(Boolean)
      .join(", ");

    const temp = parseFloat(currentWeather.main.temp as string);
    const rawMain = currentWeather.main as any;
    const feelsLike = parseFloat(rawMain.feels_like ?? rawMain.temp);
    const humidity = parseFloat(currentWeather.main.humidity as string);
    const windSpeed = parseFloat(currentWeather.wind.speed as string);
    const description = currentWeather.weather[0].description;

    // Wind direction
    const dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
    const windDir = dirs[Math.floor(currentWeather.wind.deg / 22.5 + 0.5) % 16];

    // ── Build embed ──────────────────────────────────────────────────────────
    const embed = new EmbedBuilder()
      .setTitle(`🌡️ Weather Report for ${locationName} (${zipStr})`)
      .setDescription(
        `*Brought to you by someone who has zero spoons left.*`,
      )
      .setColor(temp >= 80 ? 0xff4500 : temp <= 32 ? 0x00bfff : 0x7289da)
      .addFields(
        {
          name: `🌡️ Right Now: ${Math.round(temp)}°F (feels like ${Math.round(feelsLike)}°F)`,
          value: [
            tempRoast(temp),
            conditionRoast(description),
            `💨 ${windRoast(windSpeed)} out of the ${windDir}`,
            `💧 ${humidityRoast(humidity)}`,
          ].join("\n"),
          inline: false,
        },
      );

    // ── Next 24 hours (8 x 3-hr slots) ───────────────────────────────────────
    if (forecastResult) {
      const slots = (forecastResult.forecast as any).list?.slice(0, 8) ?? [];

      const forecastLines = slots.map((slot: any) => {
        const slotTime = format(addHours(fromUnixTime(slot.dt), -8), "ha").toLowerCase();
        const slotTemp = Math.round(slot.main.temp);
        const slotDesc = slot.weather[0].description;
        const mini = forecastMiniRoast(slotTemp, slotDesc);
        return `**${slotTime}** — ${slotTemp}°F, ${slotDesc} ${mini}`;
      });

      if (forecastLines.length > 0) {
        embed.addFields({
          name: "📅 Next 24 Hours (prepare yourself)",
          value: forecastLines.join("\n") || "No forecast data. ¯\\_(ツ)_/¯",
          inline: false,
        });
      }
    } else {
      embed.addFields({
        name: "📅 Next 24 Hours",
        value:
          "Forecast unavailable. The weather API is being a piece of sh*t today.",
        inline: false,
      });
    }

    embed.setFooter({
      text: `Data from OpenWeatherMap • Updated ${format(new Date(), "h:mm a")} • Not responsible for ruined plans`,
    });

    await interaction.editReply({ embeds: [embed] });
  },
});
