import express, { Request, Response } from 'express';
import { PrismaClient, Prisma, Contact } from '.prisma/client';

const prisma = new PrismaClient();
const app = express();
app.use(express.json());

async function getPrimaryContact(contact: Contact, tx: Prisma.TransactionClient): Promise<Contact> {
    if (contact.linkPrecedence === 'PRIMARY') {
        return contact;
    }
    let current = contact;
    while (current.linkPrecedence === 'SECONDARY' && current.linkedId !== null) {
        const next = await tx.contact.findUnique({ where: { id: current.linkedId } });
        if (!next) break;
        current = next;
        if (current.linkPrecedence === 'PRIMARY') break;
    }
    return current;
}

app.post('/identify', async (req: Request, res: Response): Promise<void> => {
    let { email, phoneNumber } = req.body;
    email = email?.trim() || null;
    phoneNumber = phoneNumber?.trim() || null;

    if (!email && !phoneNumber) {
        return; //res.status(400).json({ error: 'At least one of email or phoneNumber must be provided' });
    }

    try {
        const response = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            const contacts = await tx.contact.findMany({
                where: {
                    OR: [
                        ...(email ? [{ email }] : []),
                        ...(phoneNumber ? [{ phoneNumber }] : [])
                    ],
                    deletedAt: null
                }
            });

            if (contacts.length === 0) {
                const newContact = await tx.contact.create({
                    data: {
                        email,
                        phoneNumber,
                        linkPrecedence: 'PRIMARY',
                        createdAt: new Date(),
                        updatedAt: new Date()
                    }
                });
                return {
                    contact: {
                        primaryContatctId: newContact.id,
                        emails: newContact.email ? [newContact.email] : [],
                        phoneNumbers: newContact.phoneNumber ? [newContact.phoneNumber] : [],
                        secondaryContactIds: []
                    }
                };
            }

            const primaryContacts: Contact[] = [];
            for (const contact of contacts) {
                const primary = await getPrimaryContact(contact, tx);
                primaryContacts.push(primary);
            }

            const uniquePrimaryContacts = primaryContacts.filter(
                (contact, index, self) => index === self.findIndex((c: Contact) => c.id === contact.id)
            );

            uniquePrimaryContacts.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
            const oldestPrimary = uniquePrimaryContacts[0];
            const otherPrimaries = uniquePrimaryContacts.slice(1);

            if (otherPrimaries.length > 0) {
                for (const primary of otherPrimaries) {
                    await tx.contact.update({
                        where: { id: primary.id },
                        data: {
                            linkPrecedence: 'SECONDARY',
                            linkedId: oldestPrimary.id,
                            updatedAt: new Date()
                        }
                    });
                    await tx.contact.updateMany({
                        where: { linkedId: primary.id },
                        data: {
                            linkedId: oldestPrimary.id,
                            updatedAt: new Date()
                        }
                    });
                }
            }

            const allContactsInChain = await tx.contact.findMany({
                where: {
                    OR: [
                        { id: oldestPrimary.id },
                        { linkedId: oldestPrimary.id }
                    ],
                    deletedAt: null
                }
            });

            const existingEmails = new Set<string>();
            const existingPhoneNumbers = new Set<string>();
            for (const contact of allContactsInChain) {
                if (contact.email) existingEmails.add(contact.email);
                if (contact.phoneNumber) existingPhoneNumbers.add(contact.phoneNumber);
            }

            let newContactCreated: Contact | null = null;
            const hasNewEmail = email && !existingEmails.has(email);
            const hasNewPhone = phoneNumber && !existingPhoneNumbers.has(phoneNumber);

            if (hasNewEmail || hasNewPhone) {
                newContactCreated = await tx.contact.create({
                    data: {
                        email,
                        phoneNumber,
                        linkedId: oldestPrimary.id,
                        linkPrecedence: 'SECONDARY',
                        createdAt: new Date(),
                        updatedAt: new Date()
                    }
                });
            }

            const finalContacts = await tx.contact.findMany({
                where: {
                    OR: [
                        { id: oldestPrimary.id },
                        { linkedId: oldestPrimary.id }
                    ],
                    deletedAt: null
                }
            });

            const primaryContactInChain = finalContacts.find((c: Contact) => c.id === oldestPrimary.id);
            const secondaryContactsInChain = finalContacts.filter((c: Contact) => c.id !== oldestPrimary.id);

            const emails: string[] = [];
            const emailSet = new Set<string>();
            if (primaryContactInChain?.email) {
                emails.push(primaryContactInChain.email);
                emailSet.add(primaryContactInChain.email);
            }
            for (const contact of secondaryContactsInChain) {
                if (contact.email && !emailSet.has(contact.email)) {
                    emails.push(contact.email);
                    emailSet.add(contact.email);
                }
            }

            const phoneNumbers: string[] = [];
            const phoneSet = new Set<string>();
            if (primaryContactInChain?.phoneNumber) {
                phoneNumbers.push(primaryContactInChain.phoneNumber);
                phoneSet.add(primaryContactInChain.phoneNumber);
            }
            for (const contact of secondaryContactsInChain) {
                if (contact.phoneNumber && !phoneSet.has(contact.phoneNumber)) {
                    phoneNumbers.push(contact.phoneNumber);
                    phoneSet.add(contact.phoneNumber);
                }
            }

            const secondaryContactIds = secondaryContactsInChain.map((c: Contact) => c.id);

            return {
                contact: {
                    primaryContatctId: oldestPrimary.id,
                    emails,
                    phoneNumbers,
                    secondaryContactIds
                }
            };
        });

        res.status(200).json(response);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});