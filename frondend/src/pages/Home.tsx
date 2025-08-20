import { useEffect, useState } from 'react';
import { Box, Button, Input, Heading, VStack, Text, Spinner, useToast } from '@chakra-ui/react';
import io from 'socket.io-client';
import axios from 'axios';

const socket = io(import.meta.env.VITE_API_BASE_URL);

type JobStatus = 'pending' | 'processing' | 'success' | 'failed' | 'error';

interface Job {
    spreadsheetId: string;
    status: JobStatus;
}

export default function Home() {
    const [sheetId, setSheetId] = useState('');
    const [jobs, setJobs] = useState<Job[]>([]);
    const toast = useToast();

    useEffect(() => {
        socket.on('job-status-update', (update: Job) => {
            setJobs(prev =>
                prev.map(j =>
                    j.spreadsheetId === update.spreadsheetId ? { ...j, status: update.status } : j
                )
            );
        });

        return () => {
            socket.off('job-status-update');
        };
    }, []);

    const handleSubmit = async () => {
        try {
            await axios.post(`${import.meta.env.VITE_BACKEND_URL}/api/queue-job`, {
                spreadsheetId: sheetId.trim(),
            });

            setJobs(prev => [
                { spreadsheetId: sheetId.trim(), status: 'pending' },
                ...prev.filter(j => j.spreadsheetId !== sheetId.trim()),
            ]);

            toast({
                title: 'Job submitted!',
                status: 'success',
                duration: 2000,
                isClosable: true,
            });

            setSheetId('');
        } catch (err) {
            toast({
                title: 'Failed to queue job',
                description: 'Check your backend connection',
                status: 'error',
                duration: 3000,
                isClosable: true,
            });
        }
    };

    return (
        <Box p={6}>
            <Heading mb={4}>Semantic Spreadsheet Search</Heading>
            <VStack spacing={4} align="stretch">
                <Input
                    placeholder="Enter Google Spreadsheet ID"
                    value={sheetId}
                    onChange={e => setSheetId(e.target.value)}
                />
                <Button colorScheme="blue" onClick={handleSubmit} isDisabled={!sheetId}>
                    Submit
                </Button>

                <Heading size="md" mt={6}>
                    Jobs
                </Heading>

                {jobs.map(job => (
                    <Box
                        key={job.spreadsheetId}
                        border="1px"
                        borderColor="gray.300"
                        borderRadius="md"
                        p={4}
                        bg="gray.50"
                    >
                        <Text>
                            <b>ID:</b> {job.spreadsheetId}
                        </Text>
                        <Text>
                            <b>Status:</b> {job.status}{' '}
                            {['pending', 'processing'].includes(job.status) && <Spinner size="xs" ml={2} />}
                        </Text>
                    </Box>
                ))}
            </VStack>
        </Box>
    );
}
