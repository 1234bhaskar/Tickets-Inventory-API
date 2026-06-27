import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const seedData = {
    events: [
        {
            id: "evt_001",
            title: "Anoushka Shankar — Live in Lisbon",
            venue: "Coliseu dos Recreios, Lisboa",
            starts_at: "2026-11-14T20:00:00Z",
            tiers: [
                { id: "tier_001_a", name: "Front Stalls", price: 8500, currency: "EUR", total_inventory: 50 },
                { id: "tier_001_b", name: "General Standing", price: 4500, currency: "EUR", total_inventory: 200 },
                { id: "tier_001_c", name: "Balcony", price: 3000, currency: "EUR", total_inventory: 100 },
            ],
        },
        {
            id: "evt_002",
            title: "Indie Devs Meetup — Berlin",
            venue: "Festsaal Kreuzberg, Berlin",
            starts_at: "2026-08-22T19:30:00Z",
            tiers: [
                { id: "tier_002_a", name: "Standard", price: 1500, currency: "EUR", total_inventory: 80 },
                { id: "tier_002_b", name: "Student", price: 800, currency: "EUR", total_inventory: 20 },
            ],
        },
    ],
};

async function main() {
    console.log("🌱  Starting seed...");

    for (const event of seedData.events) {
        const upsertedEvent = await prisma.event.upsert({
            where: { id: event.id },
            update: {
                title: event.title,
                venue: event.venue,
                startsAt: new Date(event.starts_at),
            },
            create: {
                id: event.id,
                title: event.title,
                venue: event.venue,
                startsAt: new Date(event.starts_at),
            },
        });

        console.log(`  ✔  Event upserted: ${upsertedEvent.id} — "${upsertedEvent.title}"`);

        for (const tier of event.tiers) {
            const upsertedTier = await prisma.tier.upsert({
                where: { id: tier.id },
                update: {
                    name: tier.name,
                    price: tier.price,
                    currency: tier.currency,
                    totalInventory: tier.total_inventory,
                },
                create: {
                    id: tier.id,
                    eventId: event.id,
                    name: tier.name,
                    price: tier.price,
                    currency: tier.currency,
                    totalInventory: tier.total_inventory,
                },
            });

            console.log(`       ✔  Tier upserted: ${upsertedTier.id} — "${upsertedTier.name}" @ ${upsertedTier.price} ${upsertedTier.currency}`);
        }
    }

    console.log("\n✅  Seed completed successfully.");
}

main()
    .catch((err) => {
        console.error("❌  Seed failed:", err);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
        await pool.end();
    });
