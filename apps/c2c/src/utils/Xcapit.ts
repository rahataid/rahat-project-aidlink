import axios, { AxiosInstance } from 'axios';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '@rumsan/prisma';

const prisma = new PrismaService();
const prismaClient = new PrismaClient();

async function getAxiiosClient() {
  // let prisma: PrismaService
  const xcapitDetails = await prisma.setting.findUnique({
    where: { name: 'XCAPIT' },
  });
  const { BASEURL, EMAIL, PASSWORD } = xcapitDetails.value as {
    BASEURL: string;
    EMAIL: string;
    PASSWORD: string;
  };
  const axiosInstance: AxiosInstance = axios.create({
    baseURL: BASEURL,
    headers: { 'Content-Type': 'application/json' },
  });

  const response = await axios.post(`${BASEURL}/api/users/login`, {
    email: EMAIL,
    password: PASSWORD,
  });
  const token = response.data.token;
  // Add a request interceptor
  axiosInstance.interceptors.request.use(async (req) => {
    req.headers.Authorization = `Bearer ${token}`;
    return req;
  });

  return axiosInstance;
}

export async function getOffRampDetails(
  beneficiaryPhone: string,
  limit: number,
  fromDate?: string,
  toDate?: string
) {
  limit = limit || 100;
  const axiosInstance = await getAxiiosClient();
  let url = `/api/off-ramps/beneficiaries/${beneficiaryPhone}?limit=${limit}`;
  if (fromDate && toDate) {
    url += `&from=${fromDate}&to=${toDate}`;
  }
  const response = await axiosInstance.get(url);
  return response.data;
}

export async function getOffRampSummary() {
  const axiosInstance = await getAxiiosClient();
  const response = await axiosInstance.get(`/api/off-ramps/summary`);
  return response.data;
}
