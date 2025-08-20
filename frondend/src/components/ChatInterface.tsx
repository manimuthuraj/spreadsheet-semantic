import { useState, useEffect, useRef, useCallback } from 'react';
import { Box, Input, Button, VStack, Heading, Text, IconButton, HStack, useToast, Spinner } from '@chakra-ui/react';
import { ChevronLeftIcon } from '@chakra-ui/icons';
import { MdSend } from 'react-icons/md';
import axios from 'axios';
import { socket } from '../socket';
import debounce from 'lodash.debounce';

interface ChatInterfaceProps {
    spreadsheetId: string;
    spreadSheetName: string;
    onBack: () => void;
}

interface ChatMessage {
    type: 'user' | 'ai';
    content: string;
    data?: any;
}

export function ChatInterface({ spreadsheetId, spreadSheetName, onBack }: ChatInterfaceProps) {
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
    const [userQueryInput, setUserQueryInput] = useState('');
    const [isSending, setIsSending] = useState(false);
    const toast = useToast();
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatMessages]);

    useEffect(() => {
        socket.on('chatResponse', (response: { result: any[]; queryId: string }) => {
            setChatMessages((prev) =>
                prev.map((msg) =>
                    msg.data?.queryId === response.queryId
                        ? {
                            ...msg,
                            content: 'AI Response:',
                            data: { ...msg.data, result: response.result, status: 'success' },
                        }
                        : msg
                )
            );
            setIsSending(false);
        });

        socket.on('chatError', (error: { queryId: string; message: string }) => {
            setChatMessages((prev) =>
                prev.map((msg) =>
                    msg.data?.queryId === error.queryId
                        ? {
                            ...msg,
                            content: `Error: ${error.message}`,
                            data: { ...msg.data, status: 'error' },
                        }
                        : msg
                )
            );
            toast({
                title: 'Chat Error.',
                description: error.message,
                status: 'error',
                duration: 5000,
                isClosable: true,
            });
            setIsSending(false);
        });

        return () => {
            socket.off('chatResponse');
            socket.off('chatError');
        };
    }, [toast]);

    const handleSendMessage = async () => {
        if (!userQueryInput.trim()) return;

        const queryText = userQueryInput;
        const queryId = `query-${Date.now()}`;

        setChatMessages((prev) => [
            ...prev,
            { type: 'user', content: queryText },
            {
                type: 'ai',
                content: 'Thinking...',
                data: { queryId, status: 'processing' },
            },
        ]);
        setUserQueryInput('');
        setIsSending(true);

        try {
            const response = await axios.post(`${API_BASE_URL}/api/sheet/search`, {
                query: userQueryInput,
                spreadsheetId,
                queryId: queryId,
            });
            setChatMessages((prev) =>
                prev.map((msg) =>
                    msg.data?.queryId === queryId
                        ? { ...msg, content: 'AI Response:', data: { ...msg.data, result: response.data.result, status: 'success' } }
                        : msg
                )
            );
        } catch (error: any) {
            console.error('Error sending message:', error);
            const errorMessage = error.response?.data?.message || 'Failed to get response.';
            setChatMessages((prev) =>
                prev.map((msg) =>
                    msg.data?.queryId === queryId
                        ? {
                            ...msg,
                            content: `Error: ${errorMessage}`,
                            data: { ...msg.data, status: 'error' },
                        }
                        : msg
                )
            );
            toast({
                title: 'Message Send Error.',
                description: errorMessage,
                status: 'error',
                duration: 5000,
                isClosable: true,
            });
        } finally {
            setIsSending(false);
        }
    };

    const debouncedHandleSendMessage = useCallback(debounce(handleSendMessage, 300), [userQueryInput, spreadsheetId]);

    const renderValue = (val: any) => {
        if (val === null || val === undefined) return 'N/A';
        if (typeof val === 'object') return JSON.stringify(val, null, 2);
        return String(val);
    };

    const renderAIResponse = (data: any) => {
        if (data.status === 'processing') {
            return (
                <HStack>
                    <Spinner size="sm" />
                    <Text>Thinking...</Text>
                </HStack>
            );
        }
        if (data.status === 'error') {
            return <Text color="red.500">{data.content || 'An error occurred.'}</Text>;
        }

        if (!data.result || data.result.length === 0) {
            return <Text>No relevant results found for your query.</Text>;
        }

        return (
            <VStack align="flex-start" spacing={4}>
                {data.result.map((item: any, index: number) => (
                    <Box key={index} p={3} borderWidth="1px" borderRadius="md" w="full">
                        <Text fontWeight="bold" fontSize="md" color="superjoin.500">
                            {item.concept_name || 'N/A'}
                        </Text>
                        <Text fontSize="sm" mt={1}>
                            <Text as="span" fontWeight="semibold">
                                Location:
                            </Text>{' '}
                            '{item.location?.sheet_name || 'N/A'}'!
                            {item.location?.cell_range || 'N/A'}
                        </Text>
                        <Text fontSize="sm">
                            <Text as="span" fontWeight="semibold">
                                Value:
                            </Text>{' '}
                            {renderValue(item.value)}
                        </Text>
                        {item.formula && item.formula !== 'N/A' && (
                            <Text fontSize="sm" whiteSpace="pre-wrap">
                                <Text as="span" fontWeight="semibold">
                                    Formula:
                                </Text>{' '}
                                {renderValue(item.formula)}
                            </Text>
                        )}
                        {item.semanticFormula && item.semanticFormula !== 'N/A' && (
                            <Text fontSize="sm" whiteSpace="pre-wrap">
                                <Text as="span" fontWeight="semibold">
                                    Semantic Formula:
                                </Text>{' '}
                                {renderValue(item.semanticFormula)}
                            </Text>
                        )}
                        {item.explanation && (
                            <Text fontSize="sm" mt={1}>
                                <Text as="span" fontWeight="semibold">
                                    Explanation:
                                </Text>{' '}
                                {item.explanation}
                            </Text>
                        )}
                        {item.BusinessContext && (
                            <Text fontSize="sm" mt={1}>
                                <Text as="span" fontWeight="semibold">
                                    Business Context:
                                </Text>{' '}
                                {item.BusinessContext}
                            </Text>
                        )}
                        {item.relevance && (
                            <Text fontSize="sm">
                                <Text as="span" fontWeight="semibold">
                                    Relevance:
                                </Text>{' '}
                                {item.relevance}
                            </Text>
                        )}
                    </Box>
                ))}
            </VStack>
        );
    };

    return (
        <Box>
            <HStack mb={4} justifyContent="space-between" alignItems="center">
                <IconButton
                    icon={<ChevronLeftIcon w={6} h={6} />}
                    aria-label="Back to Sheets"
                    onClick={onBack}
                    variant="ghost"
                    color="gray.600"
                />
                <Heading as="h1" size="lg" flex="1" textAlign="center" color="gray.700">
                    Chat with: {spreadSheetName}
                </Heading>
                <Box w="40px" />
            </HStack>

            <Text mb={6} color="gray.500" textAlign="center">
                Ready for your semantic queries.
            </Text>

            <VStack
                spacing={4}
                align="stretch"
                maxH="60vh"
                overflowY="auto"
                p={4}
                borderWidth="1px"
                borderRadius="md"
                mb={6}
                bg="gray.50"
            >
                {chatMessages.map((msg, index) => (
                    <Box
                        key={index}
                        alignSelf={msg.type === 'user' ? 'flex-end' : 'flex-start'}
                        bg={msg.type === 'user' ? 'superjoin.500' : 'white'}
                        color={msg.type === 'user' ? 'white' : 'gray.800'}
                        borderRadius="lg"
                        p={3}
                        maxW="80%"
                        boxShadow="sm"
                    >
                        <Text fontWeight="bold" mb={1}>
                            {msg.type === 'user' ? 'User:' : 'AI Response:'}
                        </Text>
                        {msg.type === 'user' ? <Text>{msg.content}</Text> : renderAIResponse(msg.data)}
                    </Box>
                ))}
                <div ref={messagesEndRef} />
            </VStack>

            <HStack>
                <Input
                    placeholder="Type your query here..."
                    value={userQueryInput}
                    onChange={(e) => setUserQueryInput(e.target.value)}
                    onKeyPress={(e) => {
                        if (e.key === 'Enter' && !isSending && userQueryInput.trim()) {
                            debouncedHandleSendMessage();
                        }
                    }}
                    size="lg"
                    flex="1"
                    isDisabled={isSending}
                />
                <Button
                    bg="superjoin.500"
                    color="white"
                    _hover={{ bg: 'superjoin.600' }}
                    size="lg"
                    px={8}
                    onClick={debouncedHandleSendMessage}
                    isDisabled={isSending}
                    isLoading={isSending}
                    rightIcon={!isSending ? <MdSend /> : undefined}
                >
                    Send
                </Button>
            </HStack>
            <Text fontSize="sm" color="gray.500" mt={2}>
                Status: {isSending ? 'Sending...' : 'Ready to chat'}
            </Text>
        </Box>
    );
}