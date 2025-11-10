[![Coverage Status](https://coveralls.io/repos/github/rahataid/rahat-project-c2c/badge.svg?branch=main)](https://coveralls.io/github/rahataid/rahat-project-c2c?branch=main)

# Rahat Project C2C Documentation

## Summary

The Rahat Project Aidlink is a monorepo designed to facilitate a Crypto-2-Crypto Cash Voucher Assistance (CVA) flow. It includes features such as a deposit token feature with a QR code, user roles and permissions with whitelisting for disbursement transactions, disbursement approvals with detailed execution information, and a multi-sig disbursement flow directed back to the safe wallet. This project is dependent on the `rahat-core` project, which must be set up and running before starting the Rahat Project Aidlink.

## Prerequisites

Ensure your system has the following dependencies installed:

- Docker: Version 20.10.7 or higher
- Node.js: Version 20.10.0 or higher
- pnpm (Package Manager): Version 6.16.1 or higher

Before beginning, ensure the `rahat-core` project is set up and running by following the instructions in the `rahat-core` repository.

## Setup and Running Locally

### Step 1: Clone the Project

Clone the Rahat Project Aidlink repository using the following command:

```sh
git clone git@github.com:rahataid/rahat-project-aidlink.git
```

### Step 2: Navigate to the Project Directory and Bootstrap the Project

Navigate to the project directory and bootstrap the project using pnpm:

```sh
pnpm bootstrap
```

This command will:

<li>Install all dependencies across the monorepo
<li>Set up project workspaces
<li>Configure inter-package dependencies

### Step 3: Environment Configuration
Create and configure environment files
```
# Copy environment configuration
cp .env.example .env
```

Important: Configure your environment variables to connect with your running rahat-platform instance.


### Step 3: Run the Project

Start the project using the following command:

```sh
pnpm start
```
This will start all necessary services for the Aidlink project.
 

## Description

### Crypto-2-Crypto CVA Flow

#### Disbursement Approvals

- **Execution Details:** Include the person who executed the last transaction and add a timestamp instead of just the date.

#### Multi-Sig Disbursement

- **Disbursement Flow:** Identify the flow for directing multi-sig disbursements back to the safe wallet.

By following these instructions, you will be able to set up and run the Rahat Project Aidlink locally, and leverage its features for Crypto-2-Crypto Cash Voucher Assistance.

---
