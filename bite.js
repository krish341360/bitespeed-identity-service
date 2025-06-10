"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const client_1 = require(".prisma/client");
const prisma = new client_1.PrismaClient();
const app = (0, express_1.default)();
app.use(express_1.default.json());
function getPrimaryContact(contact, tx) {
    return __awaiter(this, void 0, void 0, function* () {
        if (contact.linkPrecedence === 'PRIMARY') {
            return contact;
        }
        let current = contact;
        while (current.linkPrecedence === 'SECONDARY' && current.linkedId !== null) {
            const next = yield tx.contact.findUnique({ where: { id: current.linkedId } });
            if (!next)
                break;
            current = next;
            if (current.linkPrecedence === 'PRIMARY')
                break;
        }
        return current;
    });
}
app.post('/identify', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    let { email, phoneNumber } = req.body;
    email = (email === null || email === void 0 ? void 0 : email.trim()) || null;
    phoneNumber = (phoneNumber === null || phoneNumber === void 0 ? void 0 : phoneNumber.trim()) || null;
    if (!email && !phoneNumber) {
        return; //res.status(400).json({ error: 'At least one of email or phoneNumber must be provided' });
    }
    try {
        const response = yield prisma.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
            const contacts = yield tx.contact.findMany({
                where: {
                    OR: [
                        ...(email ? [{ email }] : []),
                        ...(phoneNumber ? [{ phoneNumber }] : [])
                    ],
                    deletedAt: null
                }
            });
            if (contacts.length === 0) {
                const newContact = yield tx.contact.create({
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
            const primaryContacts = [];
            for (const contact of contacts) {
                const primary = yield getPrimaryContact(contact, tx);
                primaryContacts.push(primary);
            }
            const uniquePrimaryContacts = primaryContacts.filter((contact, index, self) => index === self.findIndex((c) => c.id === contact.id));
            uniquePrimaryContacts.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
            const oldestPrimary = uniquePrimaryContacts[0];
            const otherPrimaries = uniquePrimaryContacts.slice(1);
            if (otherPrimaries.length > 0) {
                for (const primary of otherPrimaries) {
                    yield tx.contact.update({
                        where: { id: primary.id },
                        data: {
                            linkPrecedence: 'SECONDARY',
                            linkedId: oldestPrimary.id,
                            updatedAt: new Date()
                        }
                    });
                    yield tx.contact.updateMany({
                        where: { linkedId: primary.id },
                        data: {
                            linkedId: oldestPrimary.id,
                            updatedAt: new Date()
                        }
                    });
                }
            }
            const allContactsInChain = yield tx.contact.findMany({
                where: {
                    OR: [
                        { id: oldestPrimary.id },
                        { linkedId: oldestPrimary.id }
                    ],
                    deletedAt: null
                }
            });
            const existingEmails = new Set();
            const existingPhoneNumbers = new Set();
            for (const contact of allContactsInChain) {
                if (contact.email)
                    existingEmails.add(contact.email);
                if (contact.phoneNumber)
                    existingPhoneNumbers.add(contact.phoneNumber);
            }
            let newContactCreated = null;
            const hasNewEmail = email && !existingEmails.has(email);
            const hasNewPhone = phoneNumber && !existingPhoneNumbers.has(phoneNumber);
            if (hasNewEmail || hasNewPhone) {
                newContactCreated = yield tx.contact.create({
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
            const finalContacts = yield tx.contact.findMany({
                where: {
                    OR: [
                        { id: oldestPrimary.id },
                        { linkedId: oldestPrimary.id }
                    ],
                    deletedAt: null
                }
            });
            const primaryContactInChain = finalContacts.find((c) => c.id === oldestPrimary.id);
            const secondaryContactsInChain = finalContacts.filter((c) => c.id !== oldestPrimary.id);
            const emails = [];
            const emailSet = new Set();
            if (primaryContactInChain === null || primaryContactInChain === void 0 ? void 0 : primaryContactInChain.email) {
                emails.push(primaryContactInChain.email);
                emailSet.add(primaryContactInChain.email);
            }
            for (const contact of secondaryContactsInChain) {
                if (contact.email && !emailSet.has(contact.email)) {
                    emails.push(contact.email);
                    emailSet.add(contact.email);
                }
            }
            const phoneNumbers = [];
            const phoneSet = new Set();
            if (primaryContactInChain === null || primaryContactInChain === void 0 ? void 0 : primaryContactInChain.phoneNumber) {
                phoneNumbers.push(primaryContactInChain.phoneNumber);
                phoneSet.add(primaryContactInChain.phoneNumber);
            }
            for (const contact of secondaryContactsInChain) {
                if (contact.phoneNumber && !phoneSet.has(contact.phoneNumber)) {
                    phoneNumbers.push(contact.phoneNumber);
                    phoneSet.add(contact.phoneNumber);
                }
            }
            const secondaryContactIds = secondaryContactsInChain.map((c) => c.id);
            return {
                contact: {
                    primaryContatctId: oldestPrimary.id,
                    emails,
                    phoneNumbers,
                    secondaryContactIds
                }
            };
        }));
        res.status(200).json(response);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
}));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
