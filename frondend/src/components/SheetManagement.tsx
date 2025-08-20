import { useState, useEffect } from 'react';
import { Box, Input, Button, VStack, Heading, Text, useToast, HStack, Spinner } from '@chakra-ui/react';
import axios from 'axios';
import { socket } from '../socket';
import type { SheetJob } from '../types';

interface SheetManagementProps {
    onChatWithSheet: (sheetId: string, sheetName: string) => void;
}

export function SheetManagement({ onChatWithSheet }: SheetManagementProps) {
    const [sheetIdInput, setSheetIdInput] = useState('');
    const [loadedSheets, setLoadedSheets] = useState<SheetJob[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const toast = useToast();

    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

    useEffect(() => {
        const fetchInitialSheets = async () => {
            try {
                const response = await axios.get(`${API_BASE_URL}/api/sheets/load`);
                setLoadedSheets([...response.data?.data]);

            } catch (error) {
                console.error('Error fetching initial sheets:', error);
                toast({
                    title: 'Error loading sheets.',
                    description: 'Could not fetch existing sheets.',
                    status: 'error',
                    duration: 3000,
                    isClosable: true,
                });
            }
        };
        fetchInitialSheets();

        socket.on('sheetStatusUpdate', (updatedJob: SheetJob) => {
            console.log("mani", updatedJob)
            setLoadedSheets((prevSheets) => {
                const existingIndex = prevSheets.findIndex(
                    (sheet) => sheet._id === updatedJob._id
                );
                console.log("existingIndex", existingIndex, prevSheets)
                if (existingIndex > -1) {
                    const newSheets = [...prevSheets];
                    newSheets[existingIndex] = updatedJob;
                    return newSheets;
                } else {
                    return [...prevSheets, updatedJob];
                }
            });

            if (updatedJob.status === 'success') {
                toast({
                    title: 'Sheet Loaded!',
                    description: `${updatedJob.spreadSheetName || updatedJob.spreadsheetId} has been successfully processed.`,
                    status: 'success',
                    duration: 3000,
                    isClosable: true,
                });
            } else if (updatedJob.status === 'failed' || updatedJob.status === 'error') {
                toast({
                    title: 'Sheet Processing Failed.',
                    description: `${updatedJob.spreadSheetName || updatedJob.spreadsheetId}: ${updatedJob.error || 'Unknown error'}`,
                    status: 'error',
                    duration: 5000,
                    isClosable: true,
                });
            }
        });

        return () => {
            socket.off('sheetStatusUpdate');
        };
    }, [toast]);

    const handleLoadSheet = async () => {
        if (!sheetIdInput.trim()) {
            toast({
                title: 'Sheet ID required.',
                description: 'Please enter a Google Sheet ID.',
                status: 'warning',
                duration: 3000,
                isClosable: true,
            });
            return;
        }

        setIsLoading(true);
        try {
            const jobData = await axios.post(`${API_BASE_URL}/api/sheet/parse`, {
                spreadsheetId: sheetIdInput,
            });
            toast({
                title: 'Processing started.',
                description: 'Your sheet is being parsed. Status updates will appear below.',
                status: 'info',
                duration: 3000,
                isClosable: true,
            });
            setLoadedSheets((prev) => [
                ...prev,
                {
                    spreadsheetId: `${sheetIdInput}, ${JSON.stringify(jobData.data)}`,
                    status: 'pending',
                    ...(jobData?.data?.data ? jobData?.data?.data : {})
                },
            ]);
            setSheetIdInput('');
        } catch (error: any) {
            console.error('Error loading sheet:', error);
            let errorMessage = 'Failed to initiate parsing.';

            if (error.code === 'ECONNREFUSED') {
                errorMessage = 'Backend server is not running. Please start the backend server first.';
            } else if (error.response?.status === 400) {
                errorMessage = error.response.data?.error || 'Invalid request. Please check your Google Sheet ID.';
            } else if (error.response?.status === 500) {
                errorMessage = error.response.data?.error || 'Backend server error. Please check the server logs.';
            } else if (error.message) {
                errorMessage = error.message;
            }

            toast({
                title: 'Error loading sheet.',
                description: errorMessage,
                status: 'error',
                duration: 5000,
                isClosable: true,
            });
        } finally {
            setIsLoading(false);
        }
    };

    const getStatusColor = (status: SheetJob['status']) => {
        switch (status) {
            case 'success':
                return 'green.500';
            case 'processing':
                return 'orange.500';
            case 'pending':
                return 'blue.500';
            case 'failed':
            case 'error':
                return 'red.500';
            default:
                return 'gray.500';
        }
    };

    return (
        <Box>
            <Heading as="h1" size="lg" mb={6} color="gray.700">
                Manage Spreadsheets
            </Heading>

            <HStack mb={8}>
                <Input
                    placeholder="Enter Google Sheet ID..."
                    value={sheetIdInput}
                    onChange={(e) => setSheetIdInput(e.target.value)}
                    size="lg"
                    flex="1"
                />
                <Button
                    bg="superjoin.500"
                    color="white"
                    _hover={{ bg: 'superjoin.600' }}
                    size="lg"
                    px={8}
                    onClick={handleLoadSheet}
                    isLoading={isLoading}
                >
                    Load Sheet
                </Button>
            </HStack>

            <Heading as="h2" size="md" mb={4} color="gray.600">
                Loaded Sheets
            </Heading>
            <VStack spacing={4} align="stretch">
                {loadedSheets.length === 0 && (
                    <Text color="gray.500">No sheets loaded yet. Enter an ID above to get started.</Text>
                )}
                {loadedSheets.map((sheet) => (
                    <Box
                        key={sheet._id}
                        p={4}
                        borderWidth="1px"
                        borderRadius="md"
                        bg="white"
                        boxShadow="sm"
                        _hover={{ boxShadow: 'md' }}
                    >
                        <HStack justifyContent="space-between" alignItems="center">
                            <VStack align="flex-start" spacing={0}>
                                <Text fontWeight="bold" fontSize="lg">
                                    {sheet.spreadSheetName || 'Loading Sheet Name...'}
                                </Text>
                                <Text fontSize="sm" color="gray.500">
                                    ID: {sheet.spreadsheetId}
                                </Text>
                                {sheet.status === 'failed' || sheet.status === 'error' ? (
                                    <Text fontSize="sm" color="red.500">
                                        Error: {sheet.error || 'Failed to process.'}
                                    </Text>
                                ) : null}
                            </VStack>
                            <HStack>
                                <Text
                                    fontWeight="semibold"
                                    color={getStatusColor(sheet.status)}
                                    textTransform="capitalize"
                                >
                                    {sheet.status}
                                    {(sheet.status === 'pending' || sheet.status === 'processing') && (
                                        <HStack>
                                            <Text fontWeight="semibold" color="blue.500">Loading</Text>
                                            <Spinner size="sm" />
                                        </HStack>
                                    )}
                                </Text>
                                {sheet.status === 'success' && (
                                    <Button
                                        size="sm"
                                        bg="superjoin.500"
                                        color="white"
                                        _hover={{ bg: 'superjoin.600' }}
                                        onClick={() =>
                                            onChatWithSheet(sheet.spreadsheetId, sheet.spreadSheetName || 'Untitled Sheet')
                                        }
                                    >
                                        Chat
                                    </Button>
                                )}
                            </HStack>
                        </HStack>
                    </Box>
                ))}
            </VStack>
        </Box>
    );
}