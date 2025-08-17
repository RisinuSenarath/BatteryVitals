// Optimize charging parameters based on historical data and battery type using GenAI.

'use server';

/**
 * @fileOverview An AI agent for optimizing battery charging parameters.
 *
 * - optimizeChargingParameters - A function that optimizes charging parameters.
 * - OptimizeChargingParametersInput - The input type for the optimizeChargingParameters function.
 * - OptimizeChargingParametersOutput - The return type for the optimizeChargingParameters function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const OptimizeChargingParametersInputSchema = z.object({
  portName: z.string().describe('The name of the charging port (e.g., Port 1, Port 2, Lead Acid).'),
  batteryType: z.string().describe('The type of battery being charged (e.g., Lithium Ion, NiMH, Lead Acid).'),
  sessionType: z.string().describe('The type of session: charging or discharging.'),
  historicalChargingData: z.string().describe('Historical charging data for the battery, including timestamps, voltage, and current values.'),
});
export type OptimizeChargingParametersInput = z.infer<typeof OptimizeChargingParametersInputSchema>;

const OptimizeChargingParametersOutputSchema = z.object({
  suggestedVoltage: z.number().describe('The suggested optimal voltage in volts.'),
  suggestedCurrent: z.number().describe('The suggested optimal current in amps.'),
  reasoning: z.string().describe('Explanation of why these parameters are suggested.'),
});
export type OptimizeChargingParametersOutput = z.infer<typeof OptimizeChargingParametersOutputSchema>;

export async function optimizeChargingParameters(input: OptimizeChargingParametersInput): Promise<OptimizeChargingParametersOutput> {
  return optimizeChargingParametersFlow(input);
}

const prompt = ai.definePrompt({
  name: 'optimizeChargingParametersPrompt',
  input: {schema: OptimizeChargingParametersInputSchema},
  output: {schema: OptimizeChargingParametersOutputSchema},
  prompt: `You are an expert battery management system optimizer. Analyze the historical session data and battery type to suggest optimal parameters.

Port Name: {{{portName}}}
Battery Type: {{{batteryType}}}
Session Type: {{{sessionType}}}
Historical Session Data: {{{historicalChargingData}}}

Based on this information, suggest the optimal voltage and current parameters for {{{sessionType}}} operations, and explain your reasoning. The suggestedVoltage must be in volts and the suggestedCurrent must be in amps. Do not include units in the JSON.
`,
});

const optimizeChargingParametersFlow = ai.defineFlow(
  {
    name: 'optimizeChargingParametersFlow',
    inputSchema: OptimizeChargingParametersInputSchema,
    outputSchema: OptimizeChargingParametersOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
