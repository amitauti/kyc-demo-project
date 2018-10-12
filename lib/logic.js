/*
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

/* global getFactory getAssetRegistry getParticipantRegistry emit */

/**
 * Create the kyc asset
 * @param {org.example.kycdemo.InitialApplication} initalAppliation - the InitialApplication transaction
 * @transaction
 */
async function initialApplication(application) { // eslint-disable-line no-unused-vars
    const factory = getFactory();
    const namespace = 'org.example.kycdemo';

    const request = factory.newResource(namespace, 'KYCRequest', application.kycRequestId);
    request.applicant = factory.newRelationship(namespace, 'Customer', application.applicant.getIdentifier());
    request.issuingBank = factory.newRelationship(namespace, 'BankEmployee', application.applicant.bank.getIdentifier());
    request.rules = application.rules;
    // request.productDetails = application.productDetails;
    request.evidence = [];
    request.approval = [factory.newRelationship(namespace, 'Customer', application.applicant.getIdentifier())];
    request.status = 'AWAITING_APPROVAL';

    //save the application
    const assetRegistry = await getAssetRegistry(request.getFullyQualifiedType());
    await assetRegistry.add(request);

    // emit event
    const applicationEvent = factory.newEvent(namespace, 'InitialApplicationEvent');
    applicationEvent.kyc = request;
    emit(applicationEvent);
}

/**
 * Update the kyc to show that it has been approved by a given person
 * @param {org.example.kycdemo.Approve} approve - the Approve transaction
 * @transaction
 */
async function approve(approveRequest) { // eslint-disable-line no-unused-vars
    const factory = getFactory();
    const namespace = 'org.example.kycdemo';

    let request = approveRequest.kyc;

    if (request.status === 'CLOSED' || request.status === 'REJECTED') {
        throw new Error ('This request for KYC has already been closed');
    } else if (request.approval.length === 2) {
        throw new Error ('All two parties have already approved this request for KYC');
    } else if (request.approval.includes(approveRequest.approvingParty)) {
        throw new Error ('This person has already approved this request for KYC');
    } else if (approveRequest.approvingParty.getType() === 'BankEmployee') {
        request.approval.forEach((approvingParty) => {
            let bankApproved = false;
            try {
                bankApproved = approvingParty.getType() === 'BankEmployee' && approvingParty.bank.getIdentifier() === approveRequest.approvingParty.bank.getIdentifier();
            } catch (err) {
                // ignore error as they don't have rights to access that participant
            }
            if (bankApproved) {
                throw new Error('Your bank has already approved of this request');
            }
        });
    }

    request.approval.push(factory.newRelationship(namespace, approveRequest.approvingParty.getType(), approveRequest.approvingParty.getIdentifier()));
    // update the status of the request if everyone has approved
    if (request.approval.length === 2) {
        request.status = 'APPROVED';
    }

    // update approval[]
    const assetRegistry = await getAssetRegistry(approveRequest.kyc.getFullyQualifiedType());
    await assetRegistry.update(request);

    // emit event
    const approveEvent = factory.newEvent(namespace, 'ApproveEvent');
    approveEvent.kyc = approveRequest.kyc;
    approveEvent.approvingParty = approveRequest.approvingParty;
    emit(approveEvent);
}

/**
 * Reject the kyc
 * @param {org.example.kycdemo.Reject} reject - the Reject transaction
 * @transaction
 */
async function reject(rejectRequest) { // eslint-disable-line no-unused-vars
    const factory = getFactory();
    const namespace = 'org.example.kycdemo';

    let request = rejectRequest.kyc;

    if (request.status === 'CLOSED' || request.status === 'REJECTED') {
        throw new Error('This request for KYC has already been closed');
    } else if (request.status === 'APPROVED') {
        throw new Error('This request for KYC has already been approved');
    } else {
        request.status = 'REJECTED';
        request.closeReason = rejectRequest.closeReason;

        // update the status of the kyc
        const assetRegistry = await getAssetRegistry(rejectRequest.kyc.getFullyQualifiedType());
        await assetRegistry.update(request);

        // emit event
        const rejectEvent = factory.newEvent(namespace, 'RejectEvent');
        rejectEvent.kyc = rejectRequest.kyc;
        rejectEvent.closeReason = rejectRequest.closeReason;
        emit(rejectEvent);
    }
}

/**
 * Suggest changes to the current rules in the kyc
 * @param {org.example.kycdemo.SuggestChanges} suggestChanges - the SuggestChanges transaction
 * @transaction
 */
async function suggestChanges(changeRequest) { // eslint-disable-line no-unused-vars
    const factory = getFactory();
    const namespace = 'org.example.kycdemo';

    let request = changeRequest.kyc;

    if (request.status === 'CLOSED' || request.status === 'REJECTED') {
        throw new Error ('This request for KYC has already been closed');
    } else if (request.status === 'APPROVED') {
        throw new Error('This request for KYC has already been approved');
    } else {
        request.rules = changeRequest.rules;
        // the rules have been changed - clear the approval array and update status
        request.approval = [changeRequest.suggestingParty];
        request.status = 'AWAITING_APPROVAL';

        // update the kyc with the new rules
        const assetRegistry = await getAssetRegistry(changeRequest.kyc.getFullyQualifiedType());
        await assetRegistry.update(request);

        // emit event
        const changeEvent = factory.newEvent(namespace, 'SuggestChangesEvent');
        changeEvent.kyc = changeRequest.kyc;
        changeEvent.rules = changeRequest.rules;
        changeEvent.suggestingParty = changeRequest.suggestingParty;
        emit(changeEvent);
    }
}


/**
 * Close the kyc
 * @param {org.example.kycdemo.Close} close - the Close transaction
 * @transaction
 */
async function close(closeRequest) { // eslint-disable-line no-unused-vars
    const factory = getFactory();
    const namespace = 'org.example.kycdemo';

    let request = closeRequest.kyc;

    if (request.status === 'READY_FOR_PAYMENT') {
        request.status = 'CLOSED';
        request.closeReason = closeRequest.closeReason;

        // update the status of the kyc
        const assetRegistry = await getAssetRegistry(closeRequest.kyc.getFullyQualifiedType());
        await assetRegistry.update(request);

        // emit event
        const closeEvent = factory.newEvent(namespace, 'CloseEvent');
        closeEvent.kyc = closeRequest.kyc;
        closeEvent.closeReason = closeRequest.closeReason;
        emit(closeEvent);
    } else if (request.status === 'CLOSED' || request.status === 'REJECTED') {
        throw new Error('This request for KYC has already been closed');
    } else {
        throw new Error('Cannot close this request for KYC until it is fully approved and the product has been received by the applicant');
    }
}

/**
 * Create the participants needed for the demo
 * @param {org.example.kycdemo.CreateDemoParticipants} createDemoParticipants - the CreateDemoParticipants transaction
 * @transaction
 */
async function createDemoParticipants() { // eslint-disable-line no-unused-vars
    const factory = getFactory();
    const namespace = 'org.example.kycdemo';

    // create the banks
    const bankRegistry = await getParticipantRegistry(namespace + '.Bank');
    const bank1 = factory.newResource(namespace, 'Bank', 'BoD');
    bank1.name = 'Bank of Dinero';
    await bankRegistry.add(bank1);
    const bank2 = factory.newResource(namespace, 'Bank', 'EB');
    bank2.name = 'Eastwood Banking';
    await bankRegistry.add(bank2);

    // create bank employees
    const employeeRegistry = await getParticipantRegistry(namespace + '.BankEmployee');
    const employee1 = factory.newResource(namespace, 'BankEmployee', 'matias');
    employee1.name = 'Matías';
    employee1.bank = factory.newRelationship(namespace, 'Bank', 'BoD');
    await employeeRegistry.add(employee1);
    const employee2 = factory.newResource(namespace, 'BankEmployee', 'ella');
    employee2.name = 'Ella';
    employee2.bank = factory.newRelationship(namespace, 'Bank', 'EB');
    await employeeRegistry.add(employee2);

    // create customers
    const customerRegistry = await getParticipantRegistry(namespace + '.Customer');
    const customer1 = factory.newResource(namespace, 'Customer', 'alice');
    customer1.name = 'Alice';
    customer1.lastName= 'Hamilton';
    customer1.bank = factory.newRelationship(namespace, 'Bank', 'BoD');
    customer1.companyName = 'QuickFix IT';
    await customerRegistry.add(customer1);
    const customer2 = factory.newResource(namespace, 'Customer', 'bob');
    customer2.name = 'Bob';
    customer2.lastName= 'Appleton';
    customer2.bank = factory.newRelationship(namespace, 'Bank', 'EB');
    customer2.companyName = 'Conga Computers';
    await customerRegistry.add(customer2);
}