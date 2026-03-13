"use client";

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

interface UpgradeModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
};

export const UpgradeModal = ({
    open,
    onOpenChange
}: UpgradeModalProps) => {
    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Upgrade to Pro</AlertDialogTitle>
                    <AlertDialogDescription>
                        You need an active subscription to perform this action. Upgrade to Pro to unlock all features.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction 
                       onClick={() => authClient.checkout({slug: "https://sandbox-api.polar.sh/v1/checkout-links/polar_cl_koie47YDe7wY4kPJt6v8QXUo3ygTtTgne8LD71s3EEk/redirect"})} >
                        Upgrade Now
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
};