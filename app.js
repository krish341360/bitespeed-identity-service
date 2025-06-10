// Bitespeed Identity Resolution Service - Main Application Logic

class BitespeedIdentityService {
    constructor() {
        this.contacts = [
            {
                id: 1,
                phoneNumber: "123456",
                email: "lorraine@hillvalley.edu",
                linkedId: null,
                linkPrecedence: "primary",
                createdAt: "2023-04-01T00:00:00.374Z",
                updatedAt: "2023-04-01T00:00:00.374Z",
                deletedAt: null
            },
            {
                id: 23,
                phoneNumber: "123456", 
                email: "mcfly@hillvalley.edu",
                linkedId: 1,
                linkPrecedence: "secondary",
                createdAt: "2023-04-20T05:30:00.110Z",
                updatedAt: "2023-04-20T05:30:00.110Z",
                deletedAt: null
            }
        ];
        this.nextId = 24;
        this.requestHistory = [];
        this.apiExamples = [
            {
                name: "Basic Identification",
                request: {"email": "mcfly@hillvalley.edu", "phoneNumber": "123456"},
                description: "Identify existing linked contacts"
            },
            {
                name: "Email Only Match",
                request: {"email": "lorraine@hillvalley.edu", "phoneNumber": null},
                description: "Find contacts by email only"
            },
            {
                name: "Phone Only Match", 
                request: {"email": null, "phoneNumber": "123456"},
                description: "Find contacts by phone only"
            },
            {
                name: "New Contact Creation",
                request: {"email": "new@example.com", "phoneNumber": "999999"},
                description: "Create a new primary contact"
            },
            {
                name: "Primary Conversion",
                request: {"email": "george@hillvalley.edu", "phoneNumber": "717171"},
                description: "Convert primary to secondary when linking"
            }
        ];
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.renderExampleScenarios();
        this.renderContactsTable();
        this.renderVisualization();
        this.renderDocumentationExamples();
        this.updateRequestPreview();
    }

    setupEventListeners() {
        // Navigation
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.switchSection(e.target.dataset.section);
            });
        });

        // Quick test form
        document.getElementById('quickTestForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleQuickTest();
        });

        // API test form
        document.getElementById('apiTestForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleApiTest();
        });

        // Update request preview on input change
        ['testEmail', 'testPhone'].forEach(id => {
            document.getElementById(id).addEventListener('input', () => {
                this.updateRequestPreview();
            });
        });

        // Database actions
        document.getElementById('resetDatabase').addEventListener('click', () => {
            this.resetDatabase();
        });

        document.getElementById('seedDatabase').addEventListener('click', () => {
            this.seedDatabase();
        });

        // Example scenario clicks
        document.addEventListener('click', (e) => {
            if (e.target.closest('.example-card')) {
                const card = e.target.closest('.example-card');
                const exampleName = card.dataset.example;
                this.runExample(exampleName);
            }
        });
    }

    switchSection(sectionName) {
        // Hide all sections
        document.querySelectorAll('.section').forEach(section => {
            section.classList.add('hidden');
        });

        // Show selected section
        document.getElementById(sectionName).classList.remove('hidden');

        // Update nav buttons
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.remove('nav-btn--active');
        });
        document.querySelector(`[data-section="${sectionName}"]`).classList.add('nav-btn--active');
    }

    // Core Identity Resolution Logic
    identify(email, phoneNumber) {
        const timestamp = new Date().toISOString();
        
        // Find existing contacts that match email or phone
        const matchingContacts = this.contacts.filter(contact => 
            contact.deletedAt === null && (
                (email && contact.email === email) ||
                (phoneNumber && contact.phoneNumber === phoneNumber)
            )
        );

        if (matchingContacts.length === 0) {
            // No existing contacts - create new primary contact
            const newContact = {
                id: this.nextId++,
                phoneNumber: phoneNumber || null,
                email: email || null,
                linkedId: null,
                linkPrecedence: "primary",
                createdAt: timestamp,
                updatedAt: timestamp,
                deletedAt: null
            };
            this.contacts.push(newContact);
            
            return {
                contact: {
                    primaryContactId: newContact.id,
                    emails: email ? [email] : [],
                    phoneNumbers: phoneNumber ? [phoneNumber] : [],
                    secondaryContactIds: []
                }
            };
        }

        // Get all linked contacts (including the matching ones)
        const allLinkedContacts = this.getAllLinkedContacts(matchingContacts);
        
        // Check if we need to create a new secondary contact
        const needsNewSecondary = this.needsNewSecondaryContact(allLinkedContacts, email, phoneNumber);
        
        if (needsNewSecondary) {
            // Find the primary contact to link to
            const primaryContact = allLinkedContacts.find(c => c.linkPrecedence === "primary");
            
            const newSecondary = {
                id: this.nextId++,
                phoneNumber: phoneNumber || null,
                email: email || null,
                linkedId: primaryContact.id,
                linkPrecedence: "secondary",
                createdAt: timestamp,
                updatedAt: timestamp,
                deletedAt: null
            };
            this.contacts.push(newSecondary);
            allLinkedContacts.push(newSecondary);
        }

        // Check if we need to convert primaries to secondaries
        this.handlePrimaryConversion(allLinkedContacts, timestamp);

        // Get updated linked contacts after any conversions
        const finalLinkedContacts = this.getAllLinkedContacts(allLinkedContacts);
        
        return this.formatResponse(finalLinkedContacts);
    }

    getAllLinkedContacts(initialContacts) {
        const visited = new Set();
        const result = [];

        const traverse = (contacts) => {
            for (const contact of contacts) {
                if (visited.has(contact.id) || contact.deletedAt !== null) continue;
                visited.add(contact.id);
                result.push(contact);

                // Find contacts linked to this one
                const linkedContacts = this.contacts.filter(c => 
                    c.deletedAt === null && 
                    !visited.has(c.id) && 
                    (c.linkedId === contact.id || contact.linkedId === c.id)
                );
                
                if (linkedContacts.length > 0) {
                    traverse(linkedContacts);
                }

                // Find contacts that share email or phone
                const relatedContacts = this.contacts.filter(c => 
                    c.deletedAt === null && 
                    !visited.has(c.id) && 
                    c.id !== contact.id && (
                        (contact.email && c.email === contact.email) ||
                        (contact.phoneNumber && c.phoneNumber === contact.phoneNumber)
                    )
                );
                
                if (relatedContacts.length > 0) {
                    traverse(relatedContacts);
                }
            }
        };

        traverse(initialContacts);
        return result;
    }

    needsNewSecondaryContact(linkedContacts, email, phoneNumber) {
        // Check if the exact combination already exists
        return !linkedContacts.some(contact => 
            contact.email === email && contact.phoneNumber === phoneNumber
        );
    }

    handlePrimaryConversion(linkedContacts, timestamp) {
        const primaries = linkedContacts.filter(c => c.linkPrecedence === "primary");
        
        if (primaries.length > 1) {
            // Sort by creation date to find the oldest
            primaries.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
            
            const oldestPrimary = primaries[0];
            
            // Convert all other primaries to secondaries
            for (let i = 1; i < primaries.length; i++) {
                const contact = this.contacts.find(c => c.id === primaries[i].id);
                contact.linkPrecedence = "secondary";
                contact.linkedId = oldestPrimary.id;
                contact.updatedAt = timestamp;
                primaries[i].linkPrecedence = "secondary";
                primaries[i].linkedId = oldestPrimary.id;
            }
        }
    }

    formatResponse(linkedContacts) {
        const primary = linkedContacts.find(c => c.linkPrecedence === "primary");
        const secondaries = linkedContacts.filter(c => c.linkPrecedence === "secondary");

        // Collect all unique emails and phone numbers
        const emails = [...new Set(linkedContacts.map(c => c.email).filter(Boolean))];
        const phoneNumbers = [...new Set(linkedContacts.map(c => c.phoneNumber).filter(Boolean))];

        // Sort to put primary contact's info first
        if (primary.email) {
            emails.sort((a, b) => a === primary.email ? -1 : b === primary.email ? 1 : 0);
        }
        if (primary.phoneNumber) {
            phoneNumbers.sort((a, b) => a === primary.phoneNumber ? -1 : b === primary.phoneNumber ? 1 : 0);
        }

        return {
            contact: {
                primaryContactId: primary.id,
                emails: emails,
                phoneNumbers: phoneNumbers,
                secondaryContactIds: secondaries.map(c => c.id)
            }
        };
    }

    // UI Event Handlers
    handleQuickTest() {
        const email = document.getElementById('quickEmail').value || null;
        const phone = document.getElementById('quickPhone').value || null;
        
        if (!email && !phone) {
            this.showQuickTestResult('Please provide at least email or phone number', 'error');
            return;
        }

        try {
            const result = this.identify(email, phone);
            this.showQuickTestResult(JSON.stringify(result, null, 2), 'success');
            this.renderContactsTable();
            this.renderVisualization();
        } catch (error) {
            this.showQuickTestResult(`Error: ${error.message}`, 'error');
        }
    }

    handleApiTest() {
        const email = document.getElementById('testEmail').value || null;
        const phone = document.getElementById('testPhone').value || null;
        
        if (!email && !phone) {
            this.showApiResponse('Please provide at least email or phone number', true);
            return;
        }

        try {
            const result = this.identify(email, phone);
            this.showApiResponse(result, false);
            this.addToHistory(email, phone, result);
            this.renderContactsTable();
            this.renderVisualization();
        } catch (error) {
            this.showApiResponse(`Error: ${error.message}`, true);
        }
    }

    showQuickTestResult(message, type) {
        const resultDiv = document.getElementById('quickTestResult');
        resultDiv.innerHTML = `<pre class="font-mono text-sm">${message}</pre>`;
        resultDiv.className = `test-result ${type}`;
    }

    showApiResponse(data, isError) {
        const responseDiv = document.getElementById('apiResponse');
        responseDiv.className = `response-container ${isError ? 'response-error' : 'response-success'}`;
        
        if (isError) {
            responseDiv.innerHTML = `<div class="json-formatter">${data}</div>`;
        } else {
            responseDiv.innerHTML = `<pre class="json-formatter">${this.formatJson(data)}</pre>`;
        }
    }

    updateRequestPreview() {
        const email = document.getElementById('testEmail').value || null;
        const phone = document.getElementById('testPhone').value || null;
        
        const request = {
            email: email,
            phoneNumber: phone
        };
        
        document.getElementById('requestPreview').textContent = 
            JSON.stringify(request, null, 2);
    }

    addToHistory(email, phone, response) {
        const historyItem = {
            timestamp: new Date().toLocaleString(),
            request: { email, phoneNumber: phone },
            response: response
        };
        
        this.requestHistory.unshift(historyItem);
        
        if (this.requestHistory.length > 10) {
            this.requestHistory.pop();
        }
        
        this.renderHistory();
    }

    renderHistory() {
        const historyDiv = document.getElementById('requestHistory');
        
        if (this.requestHistory.length === 0) {
            historyDiv.innerHTML = '<div class="empty-state"><p>No requests yet</p></div>';
            return;
        }
        
        historyDiv.innerHTML = this.requestHistory.map(item => `
            <div class="history-item">
                <h4>${item.timestamp}</h4>
                <div class="request">
                    <h5>Request:</h5>
                    <pre class="code-block">${JSON.stringify(item.request, null, 2)}</pre>
                </div>
                <div class="response">
                    <h5>Response:</h5>
                    <pre class="code-block">${this.formatJson(item.response)}</pre>
                </div>
            </div>
        `).join('');
    }

    // Database Management
    resetDatabase() {
        this.contacts = [
            {
                id: 1,
                phoneNumber: "123456",
                email: "lorraine@hillvalley.edu",
                linkedId: null,
                linkPrecedence: "primary",
                createdAt: "2023-04-01T00:00:00.374Z",
                updatedAt: "2023-04-01T00:00:00.374Z",
                deletedAt: null
            },
            {
                id: 23,
                phoneNumber: "123456", 
                email: "mcfly@hillvalley.edu",
                linkedId: 1,
                linkPrecedence: "secondary",
                createdAt: "2023-04-20T05:30:00.110Z",
                updatedAt: "2023-04-20T05:30:00.110Z",
                deletedAt: null
            }
        ];
        this.nextId = 24;
        this.requestHistory = [];
        this.renderContactsTable();
        this.renderVisualization();
        this.renderHistory();
        
        // Show success message
        const resultDiv = document.getElementById('quickTestResult');
        if (resultDiv) {
            this.showQuickTestResult('Database reset to initial state', 'success');
        }
    }

    seedDatabase() {
        const sampleContacts = [
            {
                id: this.nextId++,
                phoneNumber: "919191",
                email: "george@hillvalley.edu",
                linkedId: null,
                linkPrecedence: "primary",
                createdAt: "2023-04-11T00:00:00.374Z",
                updatedAt: "2023-04-11T00:00:00.374Z",
                deletedAt: null
            },
            {
                id: this.nextId++,
                phoneNumber: "717171",
                email: "biffsucks@hillvalley.edu",
                linkedId: null,
                linkPrecedence: "primary",
                createdAt: "2023-04-21T05:30:00.110Z",
                updatedAt: "2023-04-21T05:30:00.110Z",
                deletedAt: null
            },
            {
                id: this.nextId++,
                phoneNumber: "555123",
                email: "doc@hillvalley.edu",
                linkedId: null,
                linkPrecedence: "primary",
                createdAt: "2023-04-15T10:00:00.000Z",
                updatedAt: "2023-04-15T10:00:00.000Z",
                deletedAt: null
            }
        ];
        
        this.contacts.push(...sampleContacts);
        this.renderContactsTable();
        this.renderVisualization();
    }

    // Rendering Functions
    renderExampleScenarios() {
        const container = document.getElementById('exampleScenarios');
        container.innerHTML = this.apiExamples.map(example => `
            <div class="example-card" data-example="${example.name}">
                <h4>${example.name}</h4>
                <p>${example.description}</p>
                <pre class="text-sm font-mono">${JSON.stringify(example.request, null, 2)}</pre>
            </div>
        `).join('');
    }

    renderContactsTable() {
        const tbody = document.querySelector('#contactsTable tbody');
        const activeContacts = this.contacts.filter(c => c.deletedAt === null);
        
        if (activeContacts.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center">No contacts found</td></tr>';
            return;
        }
        
        tbody.innerHTML = activeContacts.map(contact => `
            <tr>
                <td>${contact.id}</td>
                <td>${contact.email || '-'}</td>
                <td>${contact.phoneNumber || '-'}</td>
                <td>${contact.linkedId || '-'}</td>
                <td><span class="status-${contact.linkPrecedence}">${contact.linkPrecedence}</span></td>
                <td>${new Date(contact.createdAt).toLocaleDateString()}</td>
                <td>${new Date(contact.updatedAt).toLocaleDateString()}</td>
            </tr>
        `).join('');
    }

    renderVisualization() {
        const container = document.getElementById('contactVisualization');
        const activeContacts = this.contacts.filter(c => c.deletedAt === null);
        
        if (activeContacts.length === 0) {
            container.innerHTML = '<div class="empty-state"><h3>No contacts to visualize</h3></div>';
            return;
        }

        // Group contacts by their relationship
        const contactGroups = this.groupContactsByRelationship(activeContacts);
        
        container.innerHTML = contactGroups.map(group => `
            <div class="contact-group">
                ${group.map((contact, index) => `
                    <div class="contact-node ${contact.linkPrecedence}">
                        <div class="contact-info">
                            <div class="id">ID: ${contact.id}</div>
                            ${contact.email ? `<div class="email">${contact.email}</div>` : ''}
                            ${contact.phoneNumber ? `<div class="phone">${contact.phoneNumber}</div>` : ''}
                            <div class="precedence status-${contact.linkPrecedence}">
                                ${contact.linkPrecedence}
                            </div>
                        </div>
                    </div>
                    ${index < group.length - 1 ? '<div class="link-arrow"></div>' : ''}
                `).join('')}
            </div>
        `).join('');
    }

    groupContactsByRelationship(contacts) {
        const groups = [];
        const visited = new Set();
        
        for (const contact of contacts) {
            if (visited.has(contact.id)) continue;
            
            const group = this.getAllLinkedContacts([contact]);
            group.sort((a, b) => {
                if (a.linkPrecedence !== b.linkPrecedence) {
                    return a.linkPrecedence === 'primary' ? -1 : 1;
                }
                return new Date(a.createdAt) - new Date(b.createdAt);
            });
            
            groups.push(group);
            group.forEach(c => visited.add(c.id));
        }
        
        return groups;
    }

    renderDocumentationExamples() {
        const container = document.getElementById('documentationExamples');
        const examples = [
            {
                title: "New Contact Creation",
                description: "When no existing contact matches the provided information.",
                request: { email: "new@example.com", phoneNumber: "999999" },
                response: {
                    contact: {
                        primaryContactId: 25,
                        emails: ["new@example.com"],
                        phoneNumbers: ["999999"],
                        secondaryContactIds: []
                    }
                }
            },
            {
                title: "Contact Linking",
                description: "When information matches existing contacts.",
                request: { email: "mcfly@hillvalley.edu", phoneNumber: "123456" },
                response: {
                    contact: {
                        primaryContactId: 1,
                        emails: ["lorraine@hillvalley.edu", "mcfly@hillvalley.edu"],
                        phoneNumbers: ["123456"],
                        secondaryContactIds: [23]
                    }
                }
            }
        ];
        
        container.innerHTML = examples.map(example => `
            <div class="scenario-example">
                <h4>${example.title}</h4>
                <p>${example.description}</p>
                <div class="request">
                    <h5>Request:</h5>
                    <pre class="code-block">${JSON.stringify(example.request, null, 2)}</pre>
                </div>
                <div class="response">
                    <h5>Response:</h5>
                    <pre class="code-block">${this.formatJson(example.response)}</pre>
                </div>
            </div>
        `).join('');
    }

    runExample(exampleName) {
        const example = this.apiExamples.find(ex => ex.name === exampleName);
        if (!example) return;
        
        // Switch to API testing section
        this.switchSection('api-testing');
        
        // Fill in the form
        document.getElementById('testEmail').value = example.request.email || '';
        document.getElementById('testPhone').value = example.request.phoneNumber || '';
        
        // Update preview
        this.updateRequestPreview();
        
        // Submit the form
        setTimeout(() => {
            this.handleApiTest();
        }, 100);
    }

    // Utility Functions
    formatJson(obj) {
        const jsonString = JSON.stringify(obj, null, 2);
        return jsonString
            .replace(/"([^"]+)":/g, '<span class="json-key">"$1"</span>:')
            .replace(/: "([^"]+)"/g, ': <span class="json-string">"$1"</span>')
            .replace(/: (\d+)/g, ': <span class="json-number">$1</span>')
            .replace(/: null/g, ': <span class="json-null">null</span>');
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    window.bitespeedApp = new BitespeedIdentityService();
});