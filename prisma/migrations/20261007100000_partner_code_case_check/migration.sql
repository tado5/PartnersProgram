ALTER TABLE `partners`
    DROP CONSTRAINT `partners_code_format_chk`;

ALTER TABLE `partners`
    ADD CONSTRAINT `partners_code_format_chk`
        CHECK (BINARY `code` REGEXP '^EP-[2-9A-HJKMNP-TV-Z]{5}$');
