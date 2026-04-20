import * as keytar from "keytar";

const SERVICE = "jiratown";

export async function storeCredential(service: string, key: string, value: string): Promise<void> {
  await keytar.setPassword(`${SERVICE}:${service}`, key, value);
}

export async function getCredential(service: string, key: string): Promise<string | null> {
  return keytar.getPassword(`${SERVICE}:${service}`, key);
}

export async function deleteCredential(service: string, key: string): Promise<void> {
  await keytar.deletePassword(`${SERVICE}:${service}`, key);
}
